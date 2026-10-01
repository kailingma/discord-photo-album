#!/bin/bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run as root'; exit 1; }
root=/opt/discord-photo-album
[ -f /etc/discord-photo-album/gateway.env ] && [ -f /etc/discord-photo-album/config.json ] && [ -x "$root/.venv/bin/python" ] || { echo 'Existing install missing; stopped'; exit 1; }
"$root/.venv/bin/python" -m py_compile bot.py bridge.py archiver.py media_processor.py strip_metadata.py
"$root/.venv/bin/python" -c 'import discord,aiohttp; from PIL import Image; assert tuple(map(int,discord.__version__.split(".")[:2])) >= (2,5)'
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null
backup="$root/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup"
for f in bot.py bridge.py archiver.py media_processor.py strip_metadata.py; do cp -p "$root/$f" "$backup/"; done
rollback() {
  echo 'Update failed, restoring previous gateway code'
  for f in bot.py bridge.py archiver.py media_processor.py strip_metadata.py; do cp -p "$backup/$f" "$root/"; done
  systemctl start discord-photo-album.service || true
}
trap rollback ERR
systemctl stop discord-photo-album.service
install -m 0644 bot.py bridge.py archiver.py media_processor.py strip_metadata.py "$root/"
systemctl start discord-photo-album.service
systemctl is-active discord-photo-album.service
journalctl -u discord-photo-album.service -n 12 --no-pager
trap - ERR
printf 'Updated. Secrets/config/service limits unchanged. No history reindex was run. Backup: %s\n' "$backup"
