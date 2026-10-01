"""Config, naming, index and the Discord side of the photo archiver."""
import asyncio
import shutil
import json
import os
import re
import secrets
import threading
from datetime import datetime, timezone

import discord

# --- config ---------------------------------------------------------------

DEFAULTS = {
    "compress_previews": True,
    "replace_messages": False,
    "introduce_channels": False,
    "role_policy": {"viewer": [], "moderator": [], "admin": []},
    "channels": [],                 # Discord channel IDs to watch
    "data_dir": "data",             # photos + index live here
    "naming": "original",           # original | caption | sequence | date
    "folder_per_channel": False,    # data/photos/<channel>/ instead of flat
    "reply_with_link": False,        # reply in Discord with the gallery link
    "public_url": "http://localhost:8080",  # base for reply links (tunnel URL)
    "web_host": "127.0.0.1",        # localhost only; cloudflared reaches it
    "web_port": 8080,
    "logs_channel_id": 0,           # 0 = logs off
    "max_attachment_bytes": 25000000,
    "local_max_bytes": 1000000000,
    "local_reserve_bytes": 512000000,
    "archive_emoji": "\U0001F4E5",  # react to archive any message's images
}


class Config:
    """config.json with hot-reload: edits and web settings apply live."""

    def __init__(self, path):
        self.path = str(path)
        self._mtime = None
        self.data = dict(DEFAULTS)
        self.reload(force=True)

    def reload(self, force=False):
        if not os.path.exists(self.path):
            raise SystemExit(f"config.json not found at {self.path}\n"
                             "Copy config.example.json to config.json and edit it.")
        mtime = os.path.getmtime(self.path)
        if not force and mtime == self._mtime:
            return False
        with open(self.path, encoding="utf-8") as f:
            loaded = json.load(f)
        unknown = set(loaded) - set(DEFAULTS)
        if unknown:
            print(f"config: ignoring unknown keys: {', '.join(sorted(unknown))}")
        self.data = {**DEFAULTS, **{k: v for k, v in loaded.items() if k in DEFAULTS}}
        self._mtime = mtime
        return True

    def update(self, **changes):
        self.reload()
        self.data.update(changes)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        self._mtime = os.path.getmtime(self.path)

    def __getitem__(self, key):
        return self.data[key]


NAMING_MODES = ["original", "caption", "sequence", "date"]


# --- naming ----------------------------------------------------------------

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"}


def is_image(filename, content_type=""):
    return (content_type or "").startswith("image/") or \
        os.path.splitext(filename)[1].lower() in IMAGE_EXTENSIONS


VIDEO_EXTENSIONS={'.mp4','.webm','.mov','.m4v','.ogv','.avi','.mkv'}
def is_video(filename,content_type=''):
    return (content_type or '').startswith('video/') or os.path.splitext(filename)[1].lower() in VIDEO_EXTENSIONS
def is_media(filename,content_type=''):
    return is_image(filename,content_type) or is_video(filename,content_type)
def media_type(filename,content_type=''):
    if is_video(filename,content_type):
        return 'video', content_type if (content_type or '').startswith('video/') else {'.mp4':'video/mp4','.m4v':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.ogv':'video/ogg','.avi':'video/x-msvideo','.mkv':'video/x-matroska'}.get(os.path.splitext(filename)[1].lower(),'application/octet-stream')
    return 'image', content_type if (content_type or '').startswith('image/') else {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'}.get(os.path.splitext(filename)[1].lower(),'application/octet-stream')

def sanitize(text, limit=60):
    text = re.sub(r"[^\w\- .]", "", re.sub(r"\s+", " ", text or "").strip())
    return text.strip(". ")[:limit].strip()


def unique_path(directory, stem, ext):
    candidate = os.path.join(directory, stem + ext)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(directory, f"{stem}-{n}{ext}")
        n += 1
    return candidate


def pick_stem(mode, *, original, caption, posted_at, seq):
    if mode == "caption":
        return sanitize(caption) or os.path.splitext(original)[0]
    if mode == "sequence":
        return f"{seq:06d}"
    if mode == "date":
        return posted_at.astimezone().strftime("%Y-%m-%d_%H-%M-%S")
    return os.path.splitext(original)[0] or "image"


def extension_for(original, content_type=""):
    ext = os.path.splitext(original)[1].lower()
    return ext or {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
                   "image/webp": ".webp"}.get(content_type, ".png")


# --- index -----------------------------------------------------------------

class Store:
    """One JSON file next to the photos; rewritten on each save.

    ponytail: full-file rewrite per photo, fine at album scale; switch to
    sqlite (stdlib) if the index ever feels slow.
    """

    def __init__(self, path):
        self.path = str(path)
        self._lock = threading.Lock()
        self.seq = 0
        self.records = []
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            self.seq = data.get("seq", 0)
            self.records = data.get("records", [])

    def next_seq(self):
        with self._lock:
            return self.seq + 1

    def add(self, record):
        with self._lock:
            self.seq = max(self.seq, record["seq"])
            self.records.append(record)
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"seq": self.seq, "records": self.records}, f,
                          indent=2, ensure_ascii=False)
            os.replace(tmp, self.path)
        return record

    def all(self, newest_first=True):
        with self._lock:
            records = list(self.records)
        return records[::-1] if newest_first else records

    def get(self, record_id):
        return next((dict(r) for r in self.records if r["id"] == record_id), None)


# --- saving ----------------------------------------------------------------

class Archiver:
    def __init__(self, config, store, photos_root, storage=None):
        self.config = config
        self.store = store
        self.photos_root = str(photos_root)
        self.storage = storage
        self._archive_lock = asyncio.Lock()

    async def archive_attachment(self, attachment, message):
        async with self._archive_lock:
            for r in self.store.all():
                if r.get("message_id") == message.id and r.get("attachment_id") == attachment.id:
                    return None
            return await self._archive_attachment(attachment, message)

    async def _archive_attachment(self, attachment, message):
        cfg = self.config.data
        seq = self.store.next_seq()
        stem = pick_stem(cfg["naming"], original=attachment.filename,
                         caption=message.content, posted_at=message.created_at, seq=seq)
        stem = sanitize(stem) or "image"
        ext = extension_for(attachment.filename, getattr(attachment, "content_type", ""))
        directory = self.photos_root
        if cfg["folder_per_channel"]:
            directory = os.path.join(
                directory, sanitize(message.channel.name) or str(message.channel.id))
        os.makedirs(directory, exist_ok=True)
        path = unique_path(directory, stem, ext)
        if attachment.size > cfg["max_attachment_bytes"]:
            raise ValueError("Media exceeds max_attachment_bytes")
        kind,mime=media_type(attachment.filename,getattr(attachment,'content_type',''))
        data = await attachment.read()
        if len(data) > cfg["max_attachment_bytes"]:
            raise ValueError("Media exceeds max_attachment_bytes")
        if self.storage:
            # Message and attachment IDs make the remote path unique and stable.
            path = os.path.join(directory, f"{stem}-{message.id}-{attachment.id}{ext}")
            await self.storage.put(os.path.relpath(path, self.photos_root).replace(os.sep, "/"),
                                   data, mime)
        else:
            used = sum(os.path.getsize(os.path.join(root, f))
                       for root, _, files in os.walk(self.photos_root) for f in files)
            if used + len(data) > cfg["local_max_bytes"] or shutil.disk_usage(directory).free - len(data) < cfg["local_reserve_bytes"]:
                raise RuntimeError("Local archive limit reached; protect the VM disk")
            with open(path + ".tmp", "wb") as f:
                f.write(data)
            os.replace(path + ".tmp", path)
        return self.store.add({
            "id": secrets.token_hex(16),
            "seq": seq,
            "file": os.path.relpath(path, self.photos_root),
            "original": attachment.filename,
            "caption": (message.content or "").strip(),
            "author": message.author.display_name,
            "author_id": message.author.id,
            "channel": getattr(message.channel, "name", str(message.channel.id)),
            "channel_id": message.channel.id,
            "message_id": message.id,
            "attachment_id": attachment.id,
            "size_bytes": len(data),
            "media_kind": kind,
            "content_type": mime,
            "jump_url": message.jump_url,
            "posted_at": message.created_at.isoformat(),
            "saved_at": datetime.now(timezone.utc).isoformat(),
        })

    async def archive_message(self, message):
        saved = []
        for att in message.attachments:
            if is_image(att.filename, getattr(att, "content_type", "")):
                try:
                    record = await self.archive_attachment(att, message)
                    if record:
                        saved.append(record)
                except Exception as exc:
                    print(f"Archive failed for attachment {att.id}: {type(exc).__name__}; check disk/quota/credentials", flush=True)
        return saved


# --- discord bot -----------------------------------------------------------

class ArchiverBot(discord.Client):
    def __init__(self, config, archiver):
        intents = discord.Intents.default()
        intents.message_content = True  # needed to read captions
        super().__init__(intents=intents)
        self.config = config
        self.archiver = archiver

    async def on_ready(self):
        print(f"Discord: logged in as {self.user} ({self.user.id})")
        watched = self.config["channels"]
        print(f"Discord: watching {len(watched)} channel(s) {watched or '- none configured yet'}")

    async def on_message(self, message):
        if message.author.bot:
            return
        self.config.reload()  # hot-reload: edits apply without a restart
        if message.channel.id in self.config["channels"]:
            saved = await self.archiver.archive_message(message)
            if saved:
                await self._announce(message, saved)

    async def on_raw_reaction_add(self, payload):
        # The archive emoji saves any message's images, even outside watched channels.
        self.config.reload()
        if str(payload.emoji) != self.config["archive_emoji"]:
            return
        if payload.member and payload.member.bot:
            return
        channel = self.get_channel(payload.channel_id)
        if channel is None:
            try:
                channel = await self.fetch_channel(payload.channel_id)
            except discord.DiscordException:
                return
        try:
            message = await channel.fetch_message(payload.message_id)
        except discord.DiscordException:
            return
        saved = await self.archiver.archive_message(message)
        if saved:
            await self._announce(message, saved)

    async def _announce(self, message, saved):
        cfg = self.config.data
        if cfg["reply_with_link"]:
            links = "\n".join(f"{cfg['public_url'].rstrip('/')}/photo/{r['id']}" for r in saved)
            try:
                await message.reply(f"Archived {len(saved)} photo(s):\n{links}",
                                    mention_author=False)
            except discord.DiscordException as e:
                print(f"Discord: could not reply with link: {e}")
        logs_id = cfg["logs_channel_id"]
        if logs_id:
            channel = self.get_channel(logs_id) or await self._fetch(logs_id)
            if channel:
                for r in saved:
                    try:
                        await channel.send(f"Saved `{r['file']}` from {r['author']} "
                                           f"in #{r['channel']} ({r['jump_url']})")
                    except discord.DiscordException as e:
                        print(f"Discord: could not post to logs channel: {e}")

    async def _fetch(self, channel_id):
        try:
            return await self.fetch_channel(channel_id)
        except discord.DiscordException:
            return None
