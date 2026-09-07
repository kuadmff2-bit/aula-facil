from pathlib import Path

p = Path("src/finance-ultimate.tsx")
text = p.read_text(encoding="utf-8")

old_import = 'import { emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";'
new_import = 'import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";'
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit("billing import anchor not found")

old_profile = '''      setBilling(await getBillingProfile(schoolId, student.id));
      setModal({ kind: "charge", invoice, student });'''
new_profile = '''      const profile = await getBillingProfile(schoolId, student.id);
      setBilling({
        ...profile,
        payerName: profile.payerName || student.guardianName || student.name,
        phone: profile.phone || student.guardianPhone || student.phone,
      });
      setModal({ kind: "charge", invoice, student });'''
if old_profile in text:
    text = text.replace(old_profile, new_profile, 1)
elif new_profile not in text:
    raise SystemExit("billing profile preload anchor not found")

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
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) {
      onChange(replaceDatabase(database, (draft) => {
        const target = draft.invoices.find((item) => item.id === invoice.id);
        if (!target) return;
        target.status = "cancelled";
        target.cancelledAt = new Date().toISOString();
        target.cancellationReason = "Cancelada manualmente no financeiro local";
      }));
      setNotice({ tone: "warning", text: "Cobrança cancelada apenas neste dispositivo. Ative o Cloud para cancelar cobranças bancárias também no provedor." });
      return;
    }

    setBusy(true);
    setNotice({ tone: "warning", text: invoice.providerChargeId ? "Conferindo e cancelando a cobrança também no provedor..." : "Cancelando a mensalidade com segurança no servidor..." });
    try {
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de cancelar a cobrança. O cancelamento foi bloqueado para não deixar um Pix ou boleto ativo fora do AulaFácil.");
      await cancelProviderCharge({ invoiceId: invoice.id, cancelInvoice: true, reason: "Cancelada manualmente no financeiro" });
      onChange(await safePullFromCloud(schoolId, database.settings.appearance));
      setNotice({ tone: "warning", text: invoice.providerChargeId
        ? "Cobrança cancelada no provedor e no AulaFácil. O histórico foi preservado."
        : "Mensalidade cancelada no servidor. O histórico foi preservado." });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível cancelar a cobrança com segurança." });
    } finally { setBusy(false); }
  })();

  const removeProviderChargeForReissue = () => void (async () => {
    if (!modal || modal.kind !== "charge" || !modal.invoice.providerChargeId || busy) return;
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) return;
    setBusy(true);
    setNotice({ tone: "warning", text: "Conferindo o provedor e removendo a cobrança bancária atual..." });
    try {
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de substituir a cobrança bancária.");
      await cancelProviderCharge({ invoiceId: modal.invoice.id, cancelInvoice: false, reason: "Cobrança bancária removida para reemissão" });
      const restored = await safePullFromCloud(schoolId, database.settings.appearance);
      onChange(restored);
      setGeneratedCharge(null);
      setModal(null);
      setNotice({ tone: "success", text: "Pix/boleto anterior cancelado no provedor. A mensalidade continua em aberto e já pode receber uma nova cobrança." });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível substituir a cobrança bancária." });
    } finally { setBusy(false); }
  })();'''
if old_cancel in text:
    text = text.replace(old_cancel, new_cancel, 1)
elif 'const removeProviderChargeForReissue' not in text:
    raise SystemExit("cancelInvoice anchor not found")

old_grid = '<div className="billing-grid"><label><span>Método</span><select value={chargeMethod}'
new_grid = '<div className="billing-grid"><label><span>Nome do pagador</span><input maxLength={160} value={billing.payerName} onChange={(e) => setBilling({...billing, payerName:e.target.value})} placeholder="Aluno ou responsável financeiro"/></label><label><span>Método</span><select value={chargeMethod}'
if old_grid in text:
    text = text.replace(old_grid, new_grid, 1)
elif 'Nome do pagador' not in text:
    raise SystemExit("billing grid anchor not found")

old_actions = '''<div className="form-actions"><button className="secondary-button" onClick={() => { setModal(null); setNotice(null); }}>Fechar</button><button className="primary-button" disabled={busy} aria-busy={busy} onClick={() => void generateCharge()}>{busy ? `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"}...` : `Gerar ${chargeMethod === "pix" ? "Pix" : "boleto"}`}</button></div>'''
new_actions = '''<div className="form-actions">{modal.invoice.providerChargeId && <button className="text-button" disabled={busy} onClick={removeProviderChargeForReissue}>Remover cobrança atual</button>}<button className="secondary-button" onClick={() => { setModal(null); setNotice(null); }}>Fechar</button><button className="primary-button" disabled={busy} aria-busy={busy} onClick={() => void generateCharge()}>{busy ? `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"}...` : `Gerar ${chargeMethod === "pix" ? "Pix" : "boleto"}`}</button></div>'''
if old_actions in text:
    text = text.replace(old_actions, new_actions, 1)
elif 'Remover cobrança atual' not in text:
    raise SystemExit("charge form actions anchor not found")

p.write_text(text, encoding="utf-8")
print("Finance client hardening patch applied successfully")
