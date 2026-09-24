import { useQuery } from "@tanstack/react-query"
import { keys } from "../../shared/query/keys"
import { loadInvoices, loadTemplates, type InvoiceBucket } from "./api"

export function useInvoices(bucket: InvoiceBucket) {
  return useQuery({
    queryKey: keys.invoices(bucket),
    queryFn: () => loadInvoices(bucket),
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: keys.templates,
    queryFn: loadTemplates,
  })
}
