#!/usr/bin/env bash
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo --preserve-env=DOMAIN,ADMIN_LOGIN,ADMIN_PASSWORD bash "$SCRIPT" "$@"
fi

need() {
  command -v "$1" >/dev/null 2>&1
}

hex() {
  local bytes="$1"
  if need openssl; then
    openssl rand -hex "$bytes"
  else
    python3 -c "import secrets; print(secrets.token_hex($bytes))"
  fi
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

write_env() {
  umask 077
  cat > "$ENV_FILE" <<EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY=${SECRET_KEY}
ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
}

normalize_domain() {
  DOMAIN="${DOMAIN:-}"
  DOMAIN="${DOMAIN#https://}"
  DOMAIN="${DOMAIN#http://}"
  DOMAIN="${DOMAIN%/}"
  DOMAIN="${DOMAIN%%/*}"
}

ask_domain() {
  echo "Домен, по которому откроется кабинет. Без https://, например chat.firma.ru"
  printf "Домен: "
  if [[ -r /dev/tty ]]; then
    read -r DOMAIN < /dev/tty
  else
    read -r DOMAIN
  fi
}

valid_domain() {
  [[ "$DOMAIN" == *.* ]] || return 1
  [[ "$DOMAIN" != *[[:space:]]* ]] || return 1
  [[ "$DOMAIN" != *@* ]] || return 1
  [[ ${#DOMAIN} -ge 4 && ${#DOMAIN} -le 253 ]] || return 1
}

echo "Бизнес ЧАТ — установка"

if ! need curl || ! need openssl; then
  if need apt-get; then
    apt-get update -y
    apt-get install -y curl ca-certificates openssl
  else
    echo "Нужны curl и openssl."
    exit 1
  fi
fi

if ! need docker; then
  echo "Ставлю Docker…"
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  echo "Плагин docker compose не найден. Повторите установку Docker."
  exit 1
fi

load_env
normalize_domain

if [[ -z "$DOMAIN" ]]; then
  ask_domain
  normalize_domain
fi

if ! valid_domain; then
  echo "Не похоже на домен. Нужен вид chat.firma.ru — без https:// и без пути."
  exit 1
fi

CREATED_ENV=0
if [[ ! -f "$ENV_FILE" ]]; then
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(hex 24)}"
  SECRET_KEY="${SECRET_KEY:-$(hex 32)}"
  ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(hex 12)}"
  write_env
  CREATED_ENV=1
else
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?}"
  SECRET_KEY="${SECRET_KEY:?}"
  ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:?}"
  if ! grep -q "^DOMAIN=${DOMAIN}$" "$ENV_FILE"; then
    write_env
  fi
fi

chmod 600 "$ENV_FILE"

echo "Собираю и запускаю контейнеры…"
cd "$DEPLOY"
docker compose --env-file "$ENV_FILE" up -d --build

echo
echo "Готово: https://${DOMAIN}/login"
if [[ "$CREATED_ENV" -eq 1 ]]; then
  echo "Логин администратора: ${ADMIN_LOGIN}"
  echo "Пароль администратора: ${ADMIN_PASSWORD}"
  echo "Сохраните пароль. Он лежит в deploy/.env и в git не попадает."
else
  echo "Секреты взяты из deploy/.env, файл не перезаписывал."
fi
echo "Домен должен смотреть A-записью на этот сервер, порты 80 и 443 открыты."
echo "После переезда войдите и восстановите недельную копию в разделе «Копия»."
