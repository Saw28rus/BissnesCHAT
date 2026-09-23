const TEXT: Record<string, string> = {
  invalid_credentials: "Неверный логин или пароль",
  blocked: "Кабинет отключён",
  csrf: "Форма устарела. Повторите действие",
  login_taken: "Такой логин уже занят",
  rate_limited: "Слишком много попыток. Подождите немного",
  file_type: "Этот тип файла отправить нельзя",
  payload_too_large: "Файл слишком большой",
  disk_full: "На сервере мало места, загрузка остановлена",
  voice_too_long: "Голосовое длиннее трёх минут",
  empty_file: "Пустой файл",
  invalid_backup_password: "Неверный пароль копии",
  invalid_backup: "Файл копии не читается",
  validation: "Проверьте заполненные поля",
  forbidden: "Это действие недоступно",
  not_found: "Не найдено",
  unauthorized: "Нужно войти снова",
  server_error: "Ошибка сервера",
}

export function errorText(code: string | undefined): string {
  if (!code) return "Не удалось выполнить запрос"
  return TEXT[code] ?? "Не удалось выполнить запрос"
}
