#!/usr/bin/env bash
# Bouwt lokaal en zet Grote Plan op de server in een Docker-container.
#   deploy/deploy.sh                 alleen code bijwerken (data op de server blijft)
#   deploy/deploy.sh --with-data     ook ./data meesturen (overschrijft de server-data!)
set -euo pipefail
HOST=${GP_HOST:-racknerd}
PORT=${GP_PORT:-8090}
DIR='~/grote-plan'
cd "$(dirname "$0")/.."

cargo build --release
ssh "$HOST" "mkdir -p $DIR/data"
scp -q target/release/grote-plan deploy/Dockerfile "$HOST:$DIR/"
if [[ "${1:-}" == "--with-data" ]]; then
  rsync -a --delete --exclude tmp/ data/ "$HOST:$DIR/data/"
fi
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
cd $DIR
docker build -q -t grote-plan . >/dev/null
docker rm -f grote-plan >/dev/null 2>&1 || true
docker run -d --name grote-plan --restart unless-stopped \
  --user "\$(id -u):\$(id -g)" \
  -p 127.0.0.1:$PORT:8080 -v "\$PWD/data:/data" grote-plan >/dev/null
sleep 1
curl -fsS -o /dev/null -w "grote-plan draait (login: %{http_code})\n" http://127.0.0.1:$PORT/login
REMOTE
