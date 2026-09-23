import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Area, Field } from "../../shared/ui/field/Field"
import { CopyButton } from "../../shared/ui/copy/CopyButton"
import { blockAccount, changeClientPassword, createAccount, deleteAccount, loadAccounts, revokeSessions, unblockAccount, updateAccount } from "./api"
import "./accounts.css"

export function AccountForm() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(accountId)
  const [displayName, setDisplayName] = useState("")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [inn, setInn] = useState("")
  const [edoId, setEdoId] = useState("")
  const [note, setNote] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!accountId) return
    void loadAccounts("").then((items) => {
      const current = items.find((item) => item.id === accountId)
      if (!current) return
      setDisplayName(current.display_name)
      setLogin(current.login)
      setPhone(current.phone ?? "")
      setInn(current.inn ?? "")
      setEdoId(current.edo_id ?? "")
      setNote(current.note ?? "")
    })
  }, [accountId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setMessage("")
    try {
      const card = {
        display_name: displayName,
        login,
        phone,
        inn,
        edo_id: edoId,
        note,
      }
      if (!editing) {
        await createAccount({ ...card, password })
        navigate("/admin/clients")
        return
      }
      await updateAccount(accountId as string, card)
      if (password) await changeClientPassword(accountId as string, password)
      setMessage("Кабинет сохранён")
      setPassword("")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не сохранилось")
    }
  }

  async function act(action: () => Promise<unknown>, done: string) {
    setError("")
    try {
      await action()
      setMessage(done)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не выполнилось")
    }
  }

  return (
    <form className="form-page" onSubmit={onSubmit}>
      <Link to="/admin/clients">К списку</Link>
      <h1>{editing ? "Карточка клиента" : "Новый кабинет"}</h1>
      <Field label="ФИО или название" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      <Field label="Логин" value={login} onChange={(event) => setLogin(event.target.value)} required autoComplete="off" />
      <p className="hint">Логин латиницей: буквы, цифры, точка, дефис. Имя может быть по-русски.</p>
      <Field label={editing ? "Новый пароль" : "Пароль"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!editing} autoComplete="new-password" />
      <Field label="Телефон" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
      <Field label="ИНН" value={inn} onChange={(event) => setInn(event.target.value)} inputMode="numeric" maxLength={12} />
      <Field label="Номер ЭДО" value={edoId} onChange={(event) => setEdoId(event.target.value)} />
      {editing ? (
        <div className="copy-row">
          <CopyButton label="ЭДО" value={edoId} />
          <CopyButton label="Телефон" value={phone} />
          <CopyButton label="ИНН" value={inn} />
        </div>
      ) : null}
      <Area label="Заметка для себя" value={note} onChange={(event) => setNote(event.target.value)} />
      {error ? <p className="fail">{error}</p> : null}
      {message ? <p className="hint">{message}</p> : null}
      <div className="row-actions">
        <Button tone="solid" type="submit">{editing ? "Сохранить" : "Создать"}</Button>
        {editing ? (
          <>
            <Button type="button" onClick={() => void act(() => revokeSessions(accountId as string), "Сеансы завершены")}>Завершить сеансы</Button>
            <Button type="button" onClick={() => void act(() => blockAccount(accountId as string), "Кабинет заблокирован")}>Блокировать</Button>
            <Button type="button" onClick={() => void act(() => unblockAccount(accountId as string), "Кабинет открыт")}>Открыть</Button>
            <label className="switch">
              <input type="checkbox" checked={confirmDelete} onChange={(event) => setConfirmDelete(event.target.checked)} />
              Удалить переписку и файлы
            </label>
            <Button type="button" disabled={!confirmDelete} onClick={() => void act(async () => { await deleteAccount(accountId as string); navigate("/admin/clients") }, "Удалено")}>Удалить кабинет</Button>
          </>
        ) : null}
      </div>
    </form>
  )
}
