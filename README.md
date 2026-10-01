# Discord photo album, v2

Two hosts, one implementation: `web/app.js` contains the exact same gallery,
OAuth, access controls and routes for the standalone and dashboard-core editions.
`bridge.py` is the shared Discord gateway. No duplicated feature code, CI or hooks.
This keeps software features in sync, not two unrelated databases. If both front
ends must show the same photos, point them at the same D1/R2 backend and use only
ONE gateway for each channel. Do not run two gateway instances on one channel.

## What it does

Archives images, reposts the caption and angle-bracketed photo links using the
sender's display name/avatar through a Discord webhook, then deletes the original.
No mentions fire again; all URL embeds are suppressed. Unsupported polls/stickers
are retained rather than silently lost. Images and non-image attachments are carried into the
replacement. Longer captions are split at Discord's 2,000-character limit.

A failure leaves the original intact. A durable `posting` marker stops automatic
retries after an uncertain webhook send, preventing duplicate reposts. Reconcile
those records by checking Discord before clearing the marker via the internal API.
Uploaded orphan blobs after crashes may need cleanup; they are never indexed publicly.

Each channel gets a 256-bit random bearer token. On first introduction, the bot
prefixes its library link to the channel topic and posts it with previews disabled.
It never truncates an existing topic. A full topic or missing permission blocks
replacement until fixed. Startup and the next image recheck introduction state.

Every reposted image link contains that token and therefore shares the WHOLE channel
library. Remove `?token=...` to share one unguessable 128-bit photo URL only. Anyone
holding either link can pass it on. Tokens are not identity authentication.
No public library index, photo list API, directory listing or predictable image IDs.
Private/no-store responses, no-referrer and noindex headers prevent normal indexing
and referrer leaks. These do not prevent a recipient copying a picture or token.

Discord OAuth users can access libraries only if they still have View Channel and
one configured viewer/moderator/admin role. Roles and channel permission overwrites
are fetched live on each protected request; Discord errors fail closed. Discord
Administrators are album administrators. Viewer reads; moderator can unlist a photo
with DELETE `/photo/:id`; admin also manages role policies and rotates tokens at
`/channel/:id/policy`. Unlisting is not permanent blob deletion. Mutations require a
same-origin request. Sessions expire in one hour; logout is POST `/auth/logout`.
Rotating a token invalidates old library URLs immediately; old image IDs remain valid
single-image capabilities as specified. Bot publishes the new link on next image or restart.

## Discord setup (both editions)

1. Create a bot in the Discord Developer Portal. Enable Message Content intent.
2. Invite with View Channels, Read Message History, Send Messages, Attach Files,
   Manage Messages (deletion), Manage Webhooks (name/avatar repost), Manage Channels
   (channel topic). It does not require Administrator or privileged Members intent.
3. Enter numeric text-channel IDs in `config.json`. Guild text channels only for now;
   threads and forums are not silently treated as supported.
4. Set `role_policy` with Discord ROLE IDs, not user IDs. Server administrators can
   change it from the web UI. Only the initial policy is seeded from config.
5. OAuth2: register `PUBLIC_URL/auth/callback`, set client ID and client secret on
   the web host. Scope `identify` only; live role checks use the bot REST API.
6. Generate a long random `BRIDGE_TOKEN` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
   Set the same secret on web host and gateway. Set `DISCORD_TOKEN` on both.
   Use private environment files/secret storage, not chat or config.json.
7. `replace_messages` defaults FALSE. Enable only after checking test-channel
   permissions, backup and deletion behavior. Nothing in this bundle is live yet.

## Standalone (Windows, macOS, Linux)

Requires Python 3.10+, Node 22.13+ with built-in SQLite. Copy config example.

    python -m venv .venv
    # macOS/Linux: .venv/bin/pip install -r requirements.txt
    # Windows: .venv\Scripts\pip install -r requirements.txt
    cd web
    npm ci
    npm start

Run the gateway from the project root in another shell, after setting environment
variables from `.env.example` (`export NAME=value` on POSIX, `$env:NAME='value'` in
PowerShell; examples are syntax only, don't expose real secrets). Set ALBUM_URL to
local loopback and PUBLIC_URL to the HTTPS tunnel origin on the web server.

    # POSIX: .venv/bin/python bot.py
    # Windows: .venv\Scripts\python bot.py

SQLite metadata and private blobs live in `web/data` unless DATA_DIR is set. Back up
both together. Bind localhost (default); point existing cloudflared to localhost:8080.
OAuth cookies require HTTPS. Do not put a global owner-only login wall in front of
this app if channel members must use their own token or Discord login.

## Dashboard-core edition (Workers + D1 + R2)

The Workers edition uses D1 and R2 for the gallery, with a separate Python gateway for Discord.
`web/wrangler.toml` configures the gallery database and bucket, with a separate `album` table
and `album/` blob prefix. Existing dashboard files remain untouched. The Discord
Gateway still needs an always-on machine (existing droplet is suitable); Workers
alone do not replace that process.

    cd web
    npm ci
    npx wrangler d1 execute nova-dashboard --remote --file schema.sql
    # Set PUBLIC_URL to the intended HTTPS album hostname in wrangler.toml.
    npx wrangler secret put BRIDGE_TOKEN
    npx wrangler secret put DISCORD_TOKEN
    npx wrangler secret put DISCORD_CLIENT_SECRET
    npx wrangler secret put DISCORD_CLIENT_ID
    npx wrangler deploy

No route/domain is set by this bundle. Choose and attach the domain in Cloudflare,
or mount `handle()` before the dashboard's login gate under a separate hostname.
Deploy is MANUAL, not wired into the dashboard's existing Actions.
Point the ONE gateway's ALBUM_URL at the Workers edition. Do not send a dashboard
owner token to channel viewers; the bridge secret is scoped to album endpoints.
D1/R2 storage costs and retention must be checked before deployment. This version
caps each image at 25 MB but does not implement an account-wide billing cap. Set
Cloudflare budget alerts and a retention policy; it is not an unlimited free service.

## Hack Club CDN (optional, disabled)

Current API supports multipart uploads without Slack:
https://cdn.hackclub.com/docs/api
Sign into Hack Club CDN as yourself, create an API key at API Keys, and set it
privately as HACKCLUB_CDN_KEY on the gateway. Enable ARCHIVE_STORAGE=hackclub and
HACKCLUB_PUBLIC_PHOTOS=yes only if these are intended to be public raw files.
The gallery proxies CDN bytes but cannot make Hack Club's raw URLs private. CDN
quota/upload errors retain the Discord original. No Slack integration is used.
CDN API live upload was not tested with a real account or key.

## Verify / upgrade

    .venv/bin/python test_archiver.py
    .venv/bin/python test_replace.py
    cd web
    node test.js
    node test_roles.js
    npx wrangler deploy --dry-run
    # POSIX developer machine with Chrome/Pillow: ./boot-test.sh

Fresh boot and local simulated Workers/D1/R2 were exercised, including a dummy
Discord token rejection. Role, access, failure-window and replacement tests use
mocks, not a live Discord server. Real OAuth, webhook permissions, topic updates,
CDN credentials and remote Cloudflare deployment still need an owner test channel.

Keep the previous archive data backed up. This release does not automatically
migrate the old JSON index/file paths; its secure IDs, tokens and new SQLite/D1
schema need a deliberate import. Existing old bundles on the dashboard are historical,
not the secure/current version. Run this v2 bundle for both editions.

Sources: https://discord.com/developers/docs/resources/webhook
https://discord.com/developers/docs/topics/oauth2
https://cdn.hackclub.com/docs/api
Coding style: https://github.com/DietrichGebert/ponytail

Standalone remote storage: set LOCAL_STORAGE=r2, R2_ENDPOINT_URL (your HTTPS account
endpoint), R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY on the Node server.
This keeps SQLite local but streams photos into private R2 through the existing
storage option. Use only bucket-scoped credentials. R2 requests were not tested
with real credentials. Both private editions conservatively cap new uploads at
8 GB / 25,000 objects; failed writes count toward the cap to avoid unsafe retries.
The counter covers this app's uploads only, not the whole Cloudflare account.


## Gallery sharing and metadata

New media is sanitized before uploading to R2. JPEG/PNG/WebP container metadata is removed without re-encoding full-resolution pixels. JPEG may retain structural orientation; captured date is stored separately. Compressed WebP previews are separate 960px copies. The Settings toggle changes preview serving, not the full-resolution archive.

Use Settings > Clean metadata for existing archive objects. This is manual, resumable and permission-checked. It does not read history, repost or delete Discord messages. Until cleanup succeeds, old files use a preview placeholder and cannot create a new sanitized share. Previously-issued photo links remain usable.

Share defaults to a sanitized public single-photo URL. The entire-gallery checkbox grants gallery access. Public links have noindex headers and robots exclusion, but these are indexing requests, not secrecy or access control. Source-protected copies still require source-channel visibility. Token-enabled full-size media uses refreshed Discord URLs with R2 fallback; Discord bytes may include original metadata. Tokenless shares and previews use sanitized R2 copies. Gallery share tokens do not expire and are independent of channel invite rotation.

Sanitizer safety limits: 25MB per file and 16MP preview; ICC-profile images, Adobe-colour JPEGs, oriented PNG/WebP and unsupported image formats fail closed rather than change colour/pixels. Videos use ffmpeg copy-remux with container metadata removal and technical-tag verification. Codec bitstream data and visual/audio content are not anonymized. Unsupported files remain in Discord, reported unresolved. This does not promise to remove information visible in the photo/video itself.

The gateway update requires ffmpeg/ffprobe and Pillow. One file is processed at a time. The installer checks available RAM/disk before package install, makes code backups, preserves config/secrets and restores prior code on service-start failure. No history reindex or metadata cleanup runs automatically at startup.

## Per-image reindex and forwarded messages

Admins can queue a reindex from a photo view. Only the selected attachment is refreshed, with its photo URL kept intact. Jobs recheck current admin access. The gateway does not repost or delete messages while reindexing. Accessible same-server forwarded originals supply the author and original message link; snapshots without accessible originals show Author Unknown. Cross-channel originals retain source-channel access checks.

## Cloudflare Workers Builds

Connect this repository to the existing Worker. Set root directory to `web`, build command to `npm test`, and deploy command to `npx wrangler deploy --keep-vars`. Existing Worker secrets stay in Cloudflare, never in this repository. The GitHub integration and its reusable Cloudflare deploy token are required for automatic Worker deployments. The Python gateway must be updated separately; it is not deployed by Workers Builds.
