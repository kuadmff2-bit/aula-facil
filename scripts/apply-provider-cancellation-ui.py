from pathlib import Path

p = Path("src/finance-ultimate.tsx")
s = p.read_text(encoding="utf-8")

replacements = []
replacements.append((
    'import { emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";',
    'import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";'
))
replacements.append((
    '  const [reopenArmed, setReopenArmed] = useState("");\n  const [query, setQuery] = useState("");',
    '  const [reopenArmed, setReopenArmed] = useState("");\n  const [cancelArmed, setCancelArmed] = useState("");\n  const [reissueArmed, setReissueArmed] = useState("");\n  const [query, setQuery] = useState("");'
))

old_cancel = '''  const cancelInvoice = (invoice: Invoice) => {
    if (invoice.status === "paid") return;
    onChange(replaceDatabase(database, (draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = "cancelled";
      target.cancelledAt = new Date().toISOString();
      target.cancellationReason = "Cancelada manualmente no financeiro";
    }));
    setNotice({ tone: "warning", text: "Cobrança cancelada. O histórico foi preservado." });
  };'''
new_cancel = '''  const cancelInvoice = (invoice: Invoice) => void (async () => {
    if (invoice.status === "paid" || busy) return;
    if (cancelArmed !== invoice.id) {
      setCancelArmed(invoice.id);
      setReissueArmed("");
      setNotice({ tone: "warning", text: `Clique novamente em “Confirmar cancelamento” para cancelar ${invoice.reference}. Se existir Pix ou boleto, ele será cancelado primeiro no provedor.` });
      return;
    }

    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    const hasExternalCharge = Boolean(invoice.providerChargeId || invoice.pixCopyPaste || invoice.boletoUrl);
    setBusy(true);
    setNotice(null);
    try {
      if (schoolId) {
        const syncStatus = await getCloudSyncStatus(schoolId, database);
        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de cancelar a mensalidade. O cancelamento foi bloqueado para não deixar Pix ou boleto ativo no provedor.");
        const result = await cancelProviderCharge({ invoiceId: invoice.id, cancelInvoice: true, reason: "Cancelada manualmente no financeiro" });
        onChange(await safePullFromCloud(schoolId, database.settings.appearance));
        setNotice({ tone: "success", text: result.providerChargeCancelled
          ? "Mensalidade cancelada. A cobrança bancária também foi cancelada no provedor e o histórico foi preservado."
          : "Mensalidade cancelada com segurança. Não havia cobrança bancária externa ativa." });
      } else {
        if (hasExternalCharge) throw new Error("Esta mensalidade possui uma cobrança bancária vinculada. Conecte o AulaFácil Cloud para cancelar primeiro no provedor.");
        onChange(replaceDatabase(database, (draft) => {
          const target = draft.invoices.find((item) => item.id === invoice.id);
          if (!target) return;
          target.status = "cancelled";
          target.cancelledAt = new Date().toISOString();
          target.cancellationReason = "Cancelada manualmente no financeiro em modo local";
        }));
        setNotice({ tone: "warning", text: "Mensalidade local cancelada. Não havia cobrança bancária vinculada." });
      }
      setCancelArmed("");
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível cancelar a mensalidade." });
    } finally { setBusy(false); }
  })();

  const removeProviderChargeForReissue = () => void (async () => {
    if (!modal || modal.kind !== "charge" || busy) return;
    if (reissueArmed !== modal.invoice.id) {
      setReissueArmed(modal.invoice.id);
      setCancelArmed("");
      setNotice({ tone: "warning", text: "Clique novamente em “Confirmar remoção” para cancelar a cobrança bancária atual no provedor. A mensalidade continuará em aberto e poderá receber um novo Pix ou boleto." });
      return;
    }
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) {
      setNotice({ tone: "danger", text: "Conecte o AulaFácil Cloud para remover uma cobrança bancária antes da reemissão." });
      return;
    }
    setBusy(true);
    try {
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de remover a cobrança bancária para reemissão.");
      const result = await cancelProviderCharge({ invoiceId: modal.invoice.id, cancelInvoice: false, reason: "Cobrança bancária removida para reemissão" });
      const restored = await safePullFromCloud(schoolId, database.settings.appearance);
      onChange(restored);
      const refreshed = restored.invoices.find((item) => item.id === modal.invoice.id);
      if (refreshed) setModal({ ...modal, invoice: refreshed });
      setGeneratedCharge(null);
      setReissueArmed("");
      setNotice({ tone: "success", text: result.providerChargeCancelled
        ? "Cobrança bancária anterior cancelada no provedor. A mensalidade continua em aberto e já pode receber um novo Pix ou boleto."
        : "O vínculo bancário foi limpo com segurança. A mensalidade continua em aberto e pode ser reemitida." });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível preparar a reemissão." });
    } finally { setBusy(false); }
  })();'''
replacements.append((old_cancel, new_cancel))
replacements.append((
    '<button className="text-button" onClick={() => cancelInvoice(invoice)}>Cancelar</button>',
    '<button className="text-button" disabled={busy} onClick={() => cancelInvoice(invoice)}>{cancelArmed === invoice.id ? "Confirmar cancelamento" : "Cancelar"}</button>'
))
replacements.append((
    '<button aria-label="Fechar aviso" onClick={() => { setNotice(null); setReopenArmed(""); }}><X size={15}/></button>',
    '<button aria-label="Fechar aviso" onClick={() => { setNotice(null); setReopenArmed(""); setCancelArmed(""); setReissueArmed(""); }}><X size={15}/></button>'
))
replacements.append((
    '<div className="form-actions"><button className="secondary-button" onClick={() => { setModal(null); setNotice(null); }}>Fechar</button><button className="primary-button" disabled={busy} aria-busy={busy} onClick={() => void generateCharge()}>{busy ? `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"}...` : `Gerar ${chargeMethod === "pix" ? "Pix" : "boleto"}`}</button></div>',
    '<div className="form-actions">{(modal.invoice.providerChargeId || modal.invoice.pixCopyPaste || modal.invoice.boletoUrl || generatedCharge?.providerChargeId) && <button className="danger-button" disabled={busy} onClick={() => removeProviderChargeForReissue()}>{reissueArmed === modal.invoice.id ? "Confirmar remoção" : "Remover cobrança atual para reemitir"}</button>}<button className="secondary-button" onClick={() => { setModal(null); setNotice(null); setReissueArmed(""); }}>Fechar</button><button className="primary-button" disabled={busy} aria-busy={busy} onClick={() => void generateCharge()}>{busy ? `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"}...` : `Gerar ${chargeMethod === "pix" ? "Pix" : "boleto"}`}</button></div>'
))

for index, (old, new) in enumerate(replacements, 1):
    if old not in s:
        raise SystemExit(f"provider cancellation patch anchor {index} not found")
    s = s.replace(old, new, 1)

p.write_text(s, encoding="utf-8")
