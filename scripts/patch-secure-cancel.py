from pathlib import Path

path = Path('src/finance-ultimate.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        'import { emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";',
        'import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";'
    ),
    (
        '  const [reopenArmed, setReopenArmed] = useState("");\n  const [query, setQuery] = useState("");',
        '  const [reopenArmed, setReopenArmed] = useState("");\n  const [cancelArmed, setCancelArmed] = useState("");\n  const [query, setQuery] = useState("");'
    ),
    (
'''  const cancelInvoice = (invoice: Invoice) => {
    if (invoice.status === "paid") return;
    onChange(replaceDatabase(database, (draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = "cancelled";
      target.cancelledAt = new Date().toISOString();
      target.cancellationReason = "Cancelada manualmente no financeiro";
    }));
    setNotice({ tone: "warning", text: "Cobrança cancelada. O histórico foi preservado." });
  };''',
'''  const cancelInvoice = (invoice: Invoice) => void (async () => {
    if (busy || invoice.status === "paid") return;
    if (cancelArmed !== invoice.id) {
      setCancelArmed(invoice.id);
      setReopenArmed("");
      setNotice({ tone: "warning", text: `Clique novamente em “Confirmar cancelamento” para cancelar ${invoice.reference}. Se existir Pix ou boleto emitido, ele será cancelado primeiro no provedor.` });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      if (schoolId) {
        const syncStatus = await getCloudSyncStatus(schoolId, database);
        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de cancelar a mensalidade. O cancelamento foi bloqueado para evitar divergência com o provedor.");
        const result = await cancelProviderCharge({
          invoiceId: invoice.id,
          cancelInvoice: true,
          reason: "Cancelada manualmente no financeiro",
        });
        const restored = await safePullFromCloud(schoolId, database.settings.appearance);
        onChange(restored);
        setCancelArmed("");
        setNotice({
          tone: "warning",
          text: result.providerChargeCancelled
            ? "Cobrança cancelada no provedor e no AulaFácil. O Pix/boleto anterior não deve mais ser usado."
            : "Mensalidade cancelada no AulaFácil. Não havia cobrança externa ativa vinculada.",
        });
        return;
      }

      if (invoice.providerChargeId || invoice.pixCopyPaste || invoice.boletoUrl || invoice.paymentUrl) {
        throw new Error("Esta mensalidade possui indícios de cobrança bancária, mas não há uma instituição Cloud selecionada para cancelar no provedor. Conecte o Cloud antes de cancelar.");
      }

      onChange(replaceDatabase(database, (draft) => {
        const target = draft.invoices.find((item) => item.id === invoice.id);
        if (!target) return;
        target.status = "cancelled";
        target.cancelledAt = new Date().toISOString();
        target.cancellationReason = "Cancelada manualmente no financeiro em modo local";
      }));
      setCancelArmed("");
      setNotice({ tone: "warning", text: "Mensalidade local cancelada. O histórico foi preservado." });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível cancelar a cobrança com segurança." });
    } finally {
      setBusy(false);
    }
  })();'''
    ),
    (
        '<button className="text-button" onClick={() => cancelInvoice(invoice)}>Cancelar</button>',
        '<button className="text-button" disabled={busy} onClick={() => cancelInvoice(invoice)}>{cancelArmed === invoice.id ? "Confirmar cancelamento" : "Cancelar"}</button>'
    ),
    (
        'onClick={() => { setNotice(null); setReopenArmed(""); }}',
        'onClick={() => { setNotice(null); setReopenArmed(""); setCancelArmed(""); }}'
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected snippet not found:\n{old[:220]}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('secure provider cancellation UI patch applied')
