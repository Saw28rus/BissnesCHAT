import { Button } from "../../shared/ui/button/Button"

export type DraftParam = {
  key: string
  label: string
  value: string
}

type Props = {
  items: DraftParam[]
  onChange: (items: DraftParam[]) => void
}

async function copyText(value: string) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return
  }
}

export function CardParams({ items, onChange }: Props) {
  function patch(index: number, next: Partial<DraftParam>) {
    onChange(items.map((item, current) => (current === index ? { ...item, ...next } : item)))
  }

  return (
    <div className="card-params">
      <div className="card-params-head">
        <h2>Параметры</h2>
        <Button
          type="button"
          className="card-btn"
          onClick={() => onChange([...items, { key: crypto.randomUUID(), label: "", value: "" }])}
        >
          Добавить
        </Button>
      </div>
      {items.length === 0 ? <p className="hint">По умолчанию только ФИО и телефон. Остальное добавьте сами.</p> : null}
      {items.map((item, index) => (
        <div key={item.key} className="param-row">
          <input
            className="param-label"
            value={item.label}
            onChange={(event) => patch(index, { label: event.target.value })}
            placeholder="Название"
            maxLength={40}
            aria-label="Название параметра"
          />
          <input
            className="param-value"
            value={item.value}
            onChange={(event) => patch(index, { value: event.target.value })}
            placeholder="Значение"
            maxLength={200}
            aria-label="Значение параметра"
          />
          <button type="button" className="card-icon" aria-label="Скопировать" onClick={() => void copyText(item.value)} disabled={!item.value}>
            <CopyIcon />
          </button>
          <button
            type="button"
            className="card-icon"
            aria-label="Убрать параметр"
            onClick={() => onChange(items.filter((row) => row.key !== item.key))}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 4.5V3.2A1.2 1.2 0 0 0 8.3 2H3.2A1.2 1.2 0 0 0 2 3.2v5.1A1.2 1.2 0 0 0 3.2 9.5H4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
