export type ClientParam = {
  id?: string
  label: string
  value: string
}

export function edoValue(card?: { edo_id?: string | null; fields?: ClientParam[] } | null) {
  if (!card) return null
  const fromField = card.fields?.find((item) => /эдо|edo/i.test(item.label))?.value?.trim()
  return fromField || card.edo_id || null
}

export function matchHay(item: { display_name: string; login: string; phone: string | null; inn?: string | null; edo_id?: string | null; fields?: ClientParam[] }) {
  const extra = item.fields?.flatMap((field) => [field.label, field.value]) ?? []
  return [item.display_name, item.login, item.phone ?? "", item.inn ?? "", item.edo_id ?? "", ...extra]
}
