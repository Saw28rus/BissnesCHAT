import { useQuery } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { loadYookassa } from "./api"

export function useYookassa(enabled = true) {
  return useQuery({
    queryKey: keys.yookassa,
    queryFn: loadYookassa,
    enabled,
  })
}
