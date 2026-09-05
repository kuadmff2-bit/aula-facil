from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: esperado 1 trecho, encontrado {count}')
    text = text.replace(old, new, 1)

replace_once(
    '  type InvoiceStatus,\n  type SchoolDatabase,\n',
    '  type InvoiceStatus,\n  type Payment,\n  type SchoolDatabase,\n',
    'tipo Payment',
)

replace_once(
    'import { PaymentConnectionsPanel } from "./payment-connections-panel";\n',
    'import { PaymentConnectionsPanel } from "./payment-connections-panel";\n'
    'import { FinanceUltimate } from "./finance-ultimate";\n'
    'import { CloudSyncPanel } from "./cloud-sync-panel";\n'
    'import { MessageAutomationsPanel } from "./message-automations-panel";\n'
    'import { invoiceAmountDue } from "./finance-utils";\n',
    'imports Ultimate',
)

replace_once(
    'type Printable = { type: "Declaração" | "Certificado" | "Recibo"; student: Student; invoice?: Invoice } | null;\n',
    'type Printable = { type: "Declaração" | "Certificado" | "Recibo"; student: Student; invoice?: Invoice; payment?: Payment } | null;\n',
    'printable payment',
)

old_paid = '''  const setInvoicePaid = (invoice: Invoice) => {
    const nextPaid = invoice.status !== "paid";
    updateDatabase((draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = nextPaid ? "paid" : target.dueDate < localDate() ? "overdue" : "pending";
      target.paidAt = nextPaid ? new Date().toISOString() : null;
    });
    notify(nextPaid ? "Pagamento confirmado." : "Pagamento voltou para pendente.");
  };
'''
new_paid = '''  const setInvoicePaid = (invoice: Invoice) => {
    if (invoice.status === "paid") {
      notify("Pagamentos confirmados não são reabertos apagando o histórico. Use o Financeiro para estorno ou ajuste.", "warning");
      return;
    }
    if (invoice.status === "cancelled") {
      notify("Esta cobrança está cancelada.", "warning");
      return;
    }
    const breakdown = invoiceAmountDue(invoice, database.settings.finance);
    const now = new Date().toISOString();
    updateDatabase((draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = "paid";
      target.paidAt = now;
      draft.payments.push({
        id: makeId("pagamento"), studentId: invoice.studentId, invoiceId: invoice.id,
        amountReceived: breakdown.totalDue, principalAmount: breakdown.baseAmount,
        lateFeeAmount: breakdown.lateFee, interestAmount: breakdown.interest,
        discountAmount: 0, paymentMethod: "manual", status: "confirmed",
        paidAt: now, receiptNumber: `LOCAL-${now.replace(/\\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        createdAt: now,
      });
    });
    notify(`Pagamento de ${money(breakdown.totalDue)} confirmado e registrado no histórico.`);
  };
'''
replace_once(old_paid, new_paid, 'pagamento com ledger')

start = text.find('          {view === "finance" && (')
end = text.find('          {view === "notices" && (', start)
if start < 0 or end < 0:
    raise RuntimeError('bloco Financeiro não encontrado')
text = text[:start] + '''          {view === "finance" && (
            <FinanceUltimate
              database={database}
              onChange={setDatabase}
              onReceipt={(student, invoice, payment) => setPrintable({ type: "Recibo", student, invoice, payment })}
            />
          )}\n\n''' + text[end:]

replace_once(
    '              <CloudAccountPanel database={database} onReplaceDatabase={setDatabase} />\n              <PaymentConnectionsPanel />\n',
    '              <CloudAccountPanel database={database} onReplaceDatabase={setDatabase} />\n'
    '              <CloudSyncPanel database={database} onReplaceDatabase={setDatabase} />\n'
    '              <PaymentConnectionsPanel />\n'
    '              <MessageAutomationsPanel />\n',
    'painéis nuvem e mensagens',
)

replace_once(
    '{printable && <DocumentModal value={printable} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}',
    '{printable && <DocumentModal value={printable} database={database} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}',
    'database no documento',
)

replace_once(
    'function DocumentModal({ value, classItem, onClose }: { value: NonNullable<Printable>; classItem?: ClassItem; onClose: () => void }) {',
    'function DocumentModal({ value, database, classItem, onClose }: { value: NonNullable<Printable>; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void }) {',
    'assinatura DocumentModal',
)

replace_once(
    '{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} /> :',
    '{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={database.settings.institution} settings={database.settings.receipt} /> :',
    'recibo profissional',
)

# Remove branding fixo remanescente do estado vazio.
text = text.replace('monte o sistema com os dados reais da Shekinah.', 'monte o sistema com os dados reais da sua instituição.')

path.write_text(text, encoding='utf-8')
