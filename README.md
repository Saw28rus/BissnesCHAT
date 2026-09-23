# Бизнес ЧАТ

Закрытая переписка администратора с клиентами. Клиент видит только свой кабинет. Регистрации нет: логин и пароль выдаёт администратор.

Репозиторий: https://github.com/Saw28rus/BissnesCHAT

## Новый сервер — одна команда

Нужны чистый VPS (2 CPU / 4 ГБ / 50 ГБ достаточно), Ubuntu или Debian, домен с A-записью на IP сервера и доступ к этому приватному репозиторию.

```bash
git clone git@github.com:Saw28rus/BissnesCHAT.git && cd BissnesCHAT && DOMAIN=chat.example.com bash deploy/install.sh
```

Подставьте свой домен вместо `chat.example.com`. Скрипт сам поставит Docker, если его нет, запишет секреты в `deploy/.env` и поднимет PostgreSQL, API и Caddy с HTTPS.

Свой пароль администратора можно задать сразу:

```bash
git clone git@github.com:Saw28rus/BissnesCHAT.git && cd BissnesCHAT && DOMAIN=chat.example.com ADMIN_PASSWORD='ваш-пароль' bash deploy/install.sh
```

Если пароль не задан, его сгенерирует установщик и один раз напечатает. Сохраните его: в git он не попадает.

Вход: `https://ваш-домен/login`

## Обновление

На том же сервере:

```bash
cd BissnesCHAT && git pull && bash deploy/install.sh
```

`deploy/.env` уже есть — скрипт его не затирает, только пересобирает контейнеры.

## Переезд

1. На старом сервере в админке скачайте недельную копию. Пароль файла запомните отдельно.
2. На новом сервере выполните ту же одну команду установки.
3. Войдите новым паролем администратора из `.env` и восстановите копию в разделе «Копия».

Из копии возвращаются кабинеты, настройки и текст за последние сутки. Голосовые, документы и более старая переписка в недельный файл не входят.

## Что поднимается

| Сервис | Назначение |
| --- | --- |
| Caddy | HTTPS, статика PWA, `/api` и `/ws` |
| API | FastAPI, один процесс Uvicorn |
| PostgreSQL 16 | База, порт наружу не открыт |

Тома: база, загрузки, сертификаты Caddy. Наружу только порты 80 и 443.

## Локально, без Docker

На Windows без Docker API и фронт запускаются отдельно, база — SQLite.

В каталоге `server`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
$env:ENVIRONMENT="development"
$env:DATABASE_URL="sqlite+aiosqlite:///./data/bchat.db"
$env:ADMIN_PASSWORD="adminpassword1"
$env:PUBLIC_ORIGIN="http://localhost:5173"
$env:COOKIE_SECURE="false"
$env:DISK_MIN_FREE_BYTES="0"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

В каталоге `web`:

```powershell
npm install
npm run dev
```

Админка: http://localhost:5173/login — `admin` / `adminpassword1`.

## Безопасность

- `deploy/.env` не коммитить.
- Клиент не регистрируется сам и не видит чужие кабинеты.
- Пароль недельной копии сервер не хранит.
- Первый администратор создаётся из `.env` только если в базе ещё нет роли `admin`. Повторный запуск пароль не сбрасывает.
