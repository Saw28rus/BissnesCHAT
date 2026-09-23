from datetime import UTC, datetime, timedelta, timezone

from decimal import Decimal

_MONTHS = (
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
)
_MONTHS_GEN = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
_MSK = timezone(timedelta(hours=3))


def period_label(raw: str | None) -> str:
    if not raw:
        now = datetime.now(_MSK)
        return f"{_MONTHS[now.month - 1]} {now.year}"
    text = raw.strip()
    if len(text) >= 7 and text[4] == "-":
        try:
            year = int(text[:4])
            month = int(text[5:7])
            if 1 <= month <= 12:
                return f"{_MONTHS[month - 1]} {year}"
        except ValueError:
            return text
    return text


def format_rub(amount: str) -> str:
    value = Decimal(amount)
    whole, frac = f"{value:.2f}".split(".")
    grouped = f"{int(whole):,}".replace(",", " ")
    if frac == "00":
        return f"{grouped} ₽"
    return f"{grouped},{frac} ₽"


def format_expires(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    local = moment.astimezone(_MSK)
    return f"{local.day} {_MONTHS_GEN[local.month - 1]} {local.year} г., {local.strftime('%H:%M')}"


def fill_template(body: str, **values: str) -> str:
    result = body
    for key, value in values.items():
        result = result.replace("{" + key + "}", value)
    return result
