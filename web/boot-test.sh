#!/bin/sh
set -eu
export WRANGLER_SEND_METRICS=false
BRIDGE_TOKEN=dummy PUBLIC_URL=http://localhost:18761 DATA_DIR=/tmp/album-local-v2 PORT=18761 node --experimental-sqlite server.js >/tmp/album-local.log 2>&1 &
LOCAL=$!
npx wrangler dev --local --port 18762 --var BRIDGE_TOKEN:dummy --var PUBLIC_URL:http://localhost:18762 >/tmp/album-worker.log 2>&1 &
WORKER=$!
trap 'kill "$LOCAL" "$WORKER" 2>/dev/null || true; wait "$LOCAL" "$WORKER" 2>/dev/null || true' EXIT
for port in 18761 18762; do
 for i in $(seq 1 60); do if curl -fsS http://localhost:$port/ >/dev/null;then break;fi;sleep 0.3;done
 python3 ../seed_demo.py "$port"
 curl -fsS http://localhost:$port/channel/10?token=$(cat /tmp/album-demo-token-$port) >/tmp/album-page-$port.html
 curl -s -o /dev/null -w 'Unauthenticated library HTTP %{http_code}\n' http://localhost:$port/channel/10
 google-chrome --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1200,900 --screenshot=/tmp/album-$port.png "http://localhost:$port/channel/10?token=$(cat /tmp/album-demo-token-$port)" >/tmp/chrome-$port.log 2>&1
 google-chrome --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=390,844 --screenshot=/tmp/album-mobile-$port.png "http://localhost:$port/channel/10?token=$(cat /tmp/album-demo-token-$port)" >/tmp/chrome-mobile-$port.log 2>&1
 google-chrome --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1000,900 --screenshot=/tmp/album-single-$port.png "http://localhost:$port/photo/00000000000000000000000000000001" >/tmp/chrome-single-$port.log 2>&1
 done
# Gateway boot against real local bridge, with dummy Discord credentials.
cd ..
cp config.example.json /tmp/album-config-original.json
cp config.example.json config.json
for port in 18761 18762; do
 DISCORD_TOKEN=dummy ALBUM_URL=http://localhost:$port BRIDGE_TOKEN=dummy timeout 12 .venv/bin/python -u bot.py > /tmp/album-gateway-$port.log 2>&1 || true
 cat /tmp/album-gateway-$port.log
 done
rm config.json
