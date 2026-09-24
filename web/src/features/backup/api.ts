import { api } from "../../shared/api/client"

export type BackupStatus = {
  free_bytes: number
  upload_bytes: number
  uploads_blocked: boolean
  last_export_at: string | null
  reminder: boolean
}

export function loadBackupStatus() {
  return api<BackupStatus>("/api/backup/status")
}
