#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="https://github.com/Saw28rus/BissnesCHAT.git"

mkdir -p "$ROOT/var"
LOCK="$ROOT/var/update.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    echo "Обновление уже идёт."
    exit 0
  fi
fi

export GIT_TERMINAL_PROMPT=0
git -C "$ROOT" remote set-url origin "$REPO_URL"
git -C "$ROOT" fetch --depth 1 origin main
git -C "$ROOT" checkout -B main FETCH_HEAD
exec bash "$ROOT/deploy/install.sh"
