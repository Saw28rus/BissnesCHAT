#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/Saw28rus/BissnesCHAT.git"
RAW_URL="https://raw.githubusercontent.com/Saw28rus/BissnesCHAT/main/deploy/get.sh"
TARGET="/opt/bchat"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Нужен root. Вставьте:"
  echo "  curl -fsSL ${RAW_URL} | sudo bash"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y git ca-certificates curl
fi

export GIT_TERMINAL_PROMPT=0

clone_failed() {
  echo
  echo "Сервер не скачал код: репозиторий закрыт или GitHub недоступен."
  echo "Откройте репозиторий: GitHub → Settings → General → Change repository visibility → Public."
  echo "Переписка клиентов на GitHub не попадает, публичным становится только код установки."
  exit 1
}

if [[ -d "${TARGET}/.git" ]]; then
  echo "Обновляю ${TARGET}…"
  git -C "$TARGET" remote set-url origin "$REPO_URL"
  git -C "$TARGET" fetch --depth 1 origin main || clone_failed
  git -C "$TARGET" checkout -B main FETCH_HEAD
elif [[ -x "${TARGET}/deploy/install.sh" ]]; then
  echo "Код уже есть в ${TARGET}."
else
  echo "Скачиваю Бизнес ЧАТ…"
  mkdir -p "$(dirname "$TARGET")"
  rm -rf "$TARGET"
  git clone --depth 1 --branch main "$REPO_URL" "$TARGET" || clone_failed
fi

exec bash "${TARGET}/deploy/install.sh"
