import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "../../shared/api/client"
import { Button } from "../../shared/ui/button/Button"
import { Area, Field } from "../../shared/ui/field/Field"
import { Confirm } from "../../shared/ui/confirm/Confirm"
import { blockAccount, changeClientPassword, createAccount, deleteAccount, revokeSessions, unblockAccount, updateAccount } from "./api"
import { CardParams, type DraftParam } from "./CardParams"
import { dropAccount } from "./filter"
import { keys } from "../../shared/query/keys"
import { useAccount } from "./useAccounts"
import "./accounts.css"

export function AccountForm() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { account } = useAccount(accountId)
  const editing = Boolean(accountId)
  const filled = useRef<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [fields, setFields] = useState<DraftParam[]>([])
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [askDelete, setAskDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!account || filled.current === account.id) return
    filled.current = account.id
    setDisplayName(account.display_name)
    setLogin(account.login)
    setPhone(account.phone ?? "")
    setNote(account.note ?? "")
    setFields(
      (account.fields ?? []).map((item) => ({
        key: item.id || crypto.randomUUID(),
        label: item.label,
        value: item.value,
      })),
    )
  }, [account])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    setMessage("")
    const params = fields
      .map((item) => ({ label: item.label.trim(), value: item.value.trim() }))
      .filter((item) => item.label)
    try {
      const card = {
        display_name: displayName,
        login,
        phone,
        note,
        fields: params,
      }
      if (!editing) {
        await createAccount({ ...card, password })
        navigate("/admin/clients")
        return
      }
      await updateAccount(accountId as string, card)
      if (password) await changeClientPassword(accountId as string, password)
      await queryClient.invalidateQueries({ queryKey: keys.accounts })
      await queryClient.invalidateQueries({ queryKey: keys.account(accountId as string) })
      setMessage("Сохранено")
      setPassword("")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не сохранилось")
    }
  }

  async function act(action: () => Promise<unknown>, done: string) {
    setError("")
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: keys.accounts })
      if (accountId) await queryClient.invalidateQueries({ queryKey: keys.account(accountId) })
      setMessage(done)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не выполнилось")
    }
  }

  async function onDelete() {
    if (!accountId) return
    setDeleting(true)
    try {
      await deleteAccount(accountId)
      dropAccount(queryClient, accountId)
      navigate("/admin/clients")
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалилось")
      setAskDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function copyPhone() {
    if (!phone) return
    try {
      await navigator.clipboard.writeText(phone)
    } catch {
      return
    }
  }

  const blocked = account?.status === "blocked"

  return (
    <form className="client-card" onSubmit={onSubmit}>
      <Link to="/admin/clients">К списку</Link>
      <h1>{editing ? displayName || "Карточка" : "Новый клиент"}</h1>
      <Field label="ФИО" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      <div className="card-line">
        <Field label="Телефон" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
        <button type="button" className="card-icon" aria-label="Скопировать телефон" onClick={() => void copyPhone()} disabled={!phone}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1A1.2 1.2 0 0 0 3.2 9.5H4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
      <CardParams items={fields} onChange={setFields} />
      <div className="card-access">
        <h2>Кабинет</h2>
        <Field label="Логин" value={login} onChange={(event) => setLogin(event.target.value)} required autoComplete="off" />
        <p className="hint">Латиницей: буквы, цифры, точка, дефис.</p>
        <Field label={editing ? "Новый пароль" : "Пароль"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!editing} autoComplete="new-password" />
        <Area label="Заметка для себя" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {error ? <p className="fail">{error}</p> : null}
      {message ? <p className="hint">{message}</p> : null}
      {blocked ? <p className="fail">Кабинет заблокирован</p> : null}
      <div className="card-actions">
        <Button className="card-btn" tone="solid" type="submit">{editing ? "Сохранить" : "Создать"}</Button>
        {editing ? (
          <>
            <Button className="card-btn" type="button" onClick={() => void act(() => revokeSessions(accountId as string), "Сеансы завершены")}>Сеансы</Button>
            {blocked ? (
              <Button className="card-btn" type="button" onClick={() => void act(() => unblockAccount(accountId as string), "Кабинет открыт")}>Открыть</Button>
            ) : (
              <Button className="card-btn" type="button" onClick={() => void act(() => blockAccount(accountId as string), "Кабинет заблокирован")}>Блок</Button>
            )}
            <Button className="card-btn" type="button" onClick={() => setAskDelete(true)}>Удалить</Button>
          </>
        ) : null}
      </div>
      <Confirm
        open={askDelete}
        title="Удалить кабинет?"
        text="Переписка и файлы этого клиента будут удалены."
        confirmLabel="Удалить"
        busyLabel="Удаляем"
        busy={deleting}
        onCancel={() => setAskDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </form>
  )
}
