from pathlib import Path

# model.ts
p=Path('src/model.ts'); t=p.read_text(encoding='utf-8')
def once(text,old,new,label):
    c=text.count(old)
    if c!=1: raise RuntimeError(f'{label}: esperado 1, encontrado {c}')
    return text.replace(old,new,1)
t=once(t,'export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";','export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled" | "negotiated";','InvoiceStatus')
t=once(t,'const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled"];','const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled", "negotiated"];','INVOICE_STATUSES')
p.write_text(t,encoding='utf-8')

# finance-ultimate.tsx
p=Path('src/finance-ultimate.tsx'); t=p.read_text(encoding='utf-8')
t=once(t,'import { makeId, type Invoice, type Payment, type SchoolDatabase, type Student } from "./model";','import { makeId, type Invoice, type Payment, type SchoolDatabase, type Student } from "./model";\nimport { DebtNegotiationPanel } from "./debt-negotiation-panel";','finance import')
t=once(t,'type Filter = "all" | "pending" | "overdue" | "paid" | "cancelled";','type Filter = "all" | "pending" | "overdue" | "paid" | "cancelled" | "negotiated";','Filter')
t=once(t,'  if (invoice.status === "paid" || invoice.status === "cancelled") return invoice.status;','  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "negotiated") return invoice.status;','effective status')
t=once(t,'  if (status === "cancelled") return "Cancelado";','  if (status === "cancelled") return "Cancelado";\n  if (status === "negotiated") return "Renegociada";','label negotiated')
t=once(t,'{(["all","pending","overdue","paid","cancelled"] as Filter[]).map','{(["all","pending","overdue","negotiated","paid","cancelled"] as Filter[]).map','tabs')
t=once(t,'    {modal?.kind === "pay" &&','    <DebtNegotiationPanel database={database} />\n\n    {modal?.kind === "pay" &&','render debt panel')
p.write_text(t,encoding='utf-8')

# App.tsx
p=Path('src/App.tsx'); t=p.read_text(encoding='utf-8')
t=once(t,'function effectiveStatus(invoice: Invoice): InvoiceStatus {\n  if (invoice.status === "paid") return "paid";\n  return invoice.dueDate < localDate() ? "overdue" : "pending";\n}','function effectiveStatus(invoice: Invoice): InvoiceStatus {\n  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "negotiated") return invoice.status;\n  return invoice.dueDate < localDate() ? "overdue" : "pending";\n}','App effectiveStatus')
t=once(t,'function statusText(status: InvoiceStatus) {\n  return status === "paid" ? "Pago" : status === "overdue" ? "Atrasado" : "Pendente";\n}','function statusText(status: InvoiceStatus) {\n  return status === "paid" ? "Pago" : status === "overdue" ? "Atrasado" : status === "cancelled" ? "Cancelado" : status === "negotiated" ? "Renegociada" : "Pendente";\n}','statusText')
t=once(t,'    if (invoice.status === "cancelled") {\n      notify("Esta cobrança está cancelada.", "warning");\n      return;\n    }','    if (invoice.status === "cancelled" || invoice.status === "negotiated") {\n      notify(invoice.status === "negotiated" ? "Esta cobrança faz parte de uma negociação ativa." : "Esta cobrança está cancelada.", "warning");\n      return;\n    }','guard payment')
t=once(t,'  const openInvoices = database.invoices.filter((item) => effectiveStatus(item) !== "paid");','  const openInvoices = database.invoices.filter((item) => { const status = effectiveStatus(item); return status === "pending" || status === "overdue"; });','open invoices')
t=t.replace('invoices.filter((item) => effectiveStatus(item) !== "paid").reduce','invoices.filter((item) => { const status = effectiveStatus(item); return status === "pending" || status === "overdue"; }).reduce')
p.write_text(t,encoding='utf-8')

# styles
p=Path('src/styles.css'); t=p.read_text(encoding='utf-8')
if '.status.negotiated' not in t:
    t += '\n.status.negotiated{background:rgba(124,58,237,.11);color:#7c3aed}\n'
p.write_text(t,encoding='utf-8')
