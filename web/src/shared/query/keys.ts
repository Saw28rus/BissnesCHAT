export const keys = {
  accounts: ["accounts"] as const,
  account: (id: string) => ["account", id] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  yookassa: ["yookassa"] as const,
  invoices: (bucket: string) => ["invoices", bucket] as const,
  invoicesRoot: ["invoices"] as const,
  templates: ["templates"] as const,
  backup: ["backup"] as const,
  updates: ["updates"] as const,
  audit: ["audit"] as const,
}
