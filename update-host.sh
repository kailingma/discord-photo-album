#!/bin/bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run as root'; exit 1; }
root=/opt/discord-photo-album
[ -f /etc/discord-photo-album/gateway.env ] && [ -f /etc/discord-photo-album/config.json ] && [ -x "$root/.venv/bin/python" ] || { echo 'Existing install missing; stopped'; exit 1; }
# Compile staged code and check the installed dependencies before touching host files.
"$root/.venv/bin/python" -m py_compile bot.py bridge.py archiver.py media_processor.py strip_metadata.py
"$root/.venv/bin/python" -c 'import discord,aiohttp; assert tuple(map(int,discord.__version__.split(".")[:2])) >= (2,5)'
# ffmpeg remuxes without transcoding. Simulate and show disk/dependency scope before install.
command -v apt-get >/dev/null || { echo 'apt-get required; stopped'; exit 1; }
df -h "$root"
free -m
[ $(awk '/MemAvailable:/{print $2}' /proc/meminfo) -ge 245760 ] || { echo 'Less than 240 MB available memory; stopped before package install'; exit 1; }
[ $(df -Pk "$root" | awk 'NR==2 {print $4}') -ge 1048576 ] || { echo 'Less than 1 GB disk free; stopped'; exit 1; }
apt-get -s install --no-install-recommends ffmpeg
apt-get install -y --no-install-recommends ffmpeg
"$root/.venv/bin/python" -m pip install --only-binary=:all: --disable-pip-version-check 'Pillow>=10.4,<13'
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null
"$root/.venv/bin/python" -c 'from PIL import Image; print("Pillow ready", Image.__version__)'
backup="$root/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$backup"
for f in bot.py bridge.py archiver.py media_processor.py strip_metadata.py requirements.txt; do [ ! -f "$root/$f" ] || cp -p "$root/$f" "$backup/"; done
if [ -f /etc/systemd/system/discord-photo-album.service.d/remote-config.conf ]; then cp -p /etc/systemd/system/discord-photo-album.service.d/remote-config.conf "$backup/remote-config.conf"; fi
# Roll back code/service configuration if the new service fails to start.
rollback() {
  echo 'Update failed, restoring previous gateway code'
  for f in bot.py bridge.py archiver.py media_processor.py strip_metadata.py requirements.txt; do [ ! -f "$backup/$f" ] || cp -p "$backup/$f" "$root/"; done
  if [ -f "$backup/remote-config.conf" ]; then cp -p "$backup/remote-config.conf" /etc/systemd/system/discord-photo-album.service.d/remote-config.conf; else rm -f /etc/systemd/system/discord-photo-album.service.d/remote-config.conf; fi
  systemctl daemon-reload
  systemctl start discord-photo-album.service || true
}
trap rollback ERR
systemctl stop discord-photo-album.service
install -m 0644 bot.py bridge.py archiver.py media_processor.py strip_metadata.py requirements.txt "$root/"
# Config and secret env remain byte-for-byte untouched. A systemd drop-in enables remote settings.
mkdir -p /etc/systemd/system/discord-photo-album.service.d
printf '[Service]\nEnvironment=REMOTE_CONFIG=yes\nMemoryMax=320M\n' > /etc/systemd/system/discord-photo-album.service.d/remote-config.conf
systemctl daemon-reload
systemctl start discord-photo-album.service
systemctl is-active discord-photo-album.service
journalctl -u discord-photo-album.service -n 12 --no-pager
trap - ERR
printf 'Updated and started. No history reindex runs at startup. Use the manual Settings button. Old code backup: %s\n' "$backup"
