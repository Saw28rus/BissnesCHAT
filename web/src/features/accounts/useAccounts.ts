import { useQuery } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { loadAccounts, loadAccount, type AccountCard } from "./api"
import { matchAccount } from "./filter"

export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: async () => {
      const rows = await loadAccounts()
      return Array.isArray(rows) ? rows : []
    },
  })
}

export function useAccount(accountId: string | undefined) {
  const list = useAccounts()
  const cached = list.data?.find((item) => item.id === accountId)
  const query = useQuery({
    queryKey: keys.account(accountId ?? ""),
    queryFn: () => loadAccount(accountId as string),
    enabled: Boolean(accountId) && !cached,
    initialData: cached,
  })
  return { account: cached ?? query.data, loading: list.isPending && query.isPending && !cached }
}

export function filterAccounts(items: AccountCard[] | undefined, query: string) {
  if (!items) return []
  const needle = query.trim()
  if (!needle) return items
  return items.filter((item) => matchAccount(item, needle))
}
