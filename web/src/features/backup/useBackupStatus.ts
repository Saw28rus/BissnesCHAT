import { useQuery } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { loadBackupStatus } from "./api"

export function useBackupStatus() {
  return useQuery({
    queryKey: keys.backup,
    queryFn: loadBackupStatus,
    staleTime: 5 * 60 * 1000,
  })
}
