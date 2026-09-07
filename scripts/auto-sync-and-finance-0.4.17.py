from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: str, old: str, new: str):
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Trecho não encontrado em {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_section(path: str, start: str, end: str, replacement: str):
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"Início não encontrado em {path}: {start!r}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"Fim não encontrado em {path}: {end!r}")
    file.write_text(text[:a] + replacement + text[b:], encoding="utf-8")


# ---------------- App principal: sincronização automática silenciosa ----------------
replace_exact(
    "src/AppNext.tsx",
    'import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";',
    'import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";',
)
replace_exact(
    "src/AppNext.tsx",
    'import { clearSelectedSchoolPendingCloudDeletions, getCloudSyncStatus, invalidateSelectedSchoolSyncBaseline, queueCloudDeletion, safePullFromCloud } from "./cloud-safe-sync";',
    'import { clearSelectedSchoolPendingCloudDeletions, invalidateSelectedSchoolSyncBaseline, queueCloudDeletion, reconcileCloud, safePullFromCloud } from "./cloud-safe-sync";',
)
replace_exact(
    "src/AppNext.tsx",
    '  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);\n\n  useEffect(() => saveDatabase(database), [database]);',
    '''  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);\n  const [autoSyncWake, setAutoSyncWake] = useState(0);\n  const autoSyncInFlight = useRef(false);\n  const autoSyncPending = useRef(false);\n  const autoSyncLastAttention = useRef(\"\");\n\n  useEffect(() => saveDatabase(database), [database]);\n  useEffect(() => {\n    const wake = () => setAutoSyncWake((value) => value + 1);\n    const interval = window.setInterval(wake, 60_000);\n    window.addEventListener(\"online\", wake);\n    window.addEventListener(\"aulafacil:cloud-school-change\", wake);\n    return () => {\n      window.clearInterval(interval);\n      window.removeEventListener(\"online\", wake);\n      window.removeEventListener(\"aulafacil:cloud-school-change\", wake);\n    };\n  }, []);\n  useEffect(() => {\n    const schoolId = localStorage.getItem(\"aulafacil.cloud.selected-school\") ?? \"\";\n    if (!schoolId || !navigator.onLine) return;\n    const snapshotUpdatedAt = database.updatedAt;\n    let disposed = false;\n    const run = () => {\n      if (disposed) return;\n      if (autoSyncInFlight.current) {\n        autoSyncPending.current = true;\n        return;\n      }\n      autoSyncInFlight.current = true;\n      autoSyncPending.current = false;\n      void reconcileCloud(schoolId, database)\n        .then((result) => {\n          if (disposed) return;\n          autoSyncLastAttention.current = \"\";\n          if (result.database !== database) {\n            setDatabase((current) => current.updatedAt === snapshotUpdatedAt ? result.database : current);\n          }\n        })\n        .catch((error) => {\n          if (disposed) return;\n          const message = error instanceof Error ? error.message : String(error ?? \"\");\n          const needsAttention = /conflito|recuperação inicial|já possui dados na nuvem|base de sincronização/i.test(message);\n          if (needsAttention && autoSyncLastAttention.current !== message) {\n            autoSyncLastAttention.current = message;\n            setToast({ message: `Sincronização automática precisa de atenção: ${message}`, tone: \"warning\" });\n          }\n        })\n        .finally(() => {\n          autoSyncInFlight.current = false;\n          if (!disposed && autoSyncPending.current) {\n            autoSyncPending.current = false;\n            setAutoSyncWake((value) => value + 1);\n          }\n        });\n    };\n    const timeout = window.setTimeout(run, 900);\n    return () => { disposed = true; window.clearTimeout(timeout); };\n  }, [database.updatedAt, autoSyncWake]);''',
)
replace_exact(
    "src/AppNext.tsx",
    '''          const status = await getCloudSyncStatus(schoolId, database);\n          if (status !== "synced") throw new Error("Sincronize este computador antes de reabrir o pagamento.");\n          await reopenInvoicePayment({ schoolId, invoiceId: invoice.id, reason: "Pagamento marcado como pago por engano" });\n          setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));''',
    '''          const reconciled = await reconcileCloud(schoolId, database);\n          const syncedInvoice = reconciled.database.invoices.find((item) => item.id === invoice.id)\n            ?? reconciled.database.invoices.find((item) => item.studentId === invoice.studentId && item.reference === invoice.reference);\n          if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n          await reopenInvoicePayment({ schoolId, invoiceId: syncedInvoice.id, reason: "Pagamento marcado como pago por engano" });\n          setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));''',
)
replace_exact(
    "src/AppNext.tsx",
    '''        const syncStatus = await getCloudSyncStatus(schoolId, database);\n        if (syncStatus !== "synced") throw new Error("Abra “Nuvem e salvamento” e sincronize este computador antes de receber várias mensalidades.");\n        for (const invoice of invoices) await confirmManualInvoicePayment({ schoolId, invoiceId: invoice.id, method: batchMethod, discount: 0, notes: invoices.length > 1 ? "Pagamento em lote pelo cadastro do aluno" : undefined });\n        setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));''',
    '''        const reconciled = await reconcileCloud(schoolId, database);\n        const syncedInvoices = invoices.map((invoice) => reconciled.database.invoices.find((item) => item.id === invoice.id)\n          ?? reconciled.database.invoices.find((item) => item.studentId === invoice.studentId && item.reference === invoice.reference));\n        if (syncedInvoices.some((item) => !item)) throw new Error("Uma das mensalidades não foi encontrada depois da sincronização automática.");\n        for (const invoice of syncedInvoices) {\n          if (!invoice || ["paid", "cancelled", "negotiated"].includes(invoice.status)) continue;\n          await confirmManualInvoicePayment({ schoolId, invoiceId: invoice.id, method: batchMethod, discount: 0, notes: invoices.length > 1 ? "Pagamento em lote pelo cadastro do aluno" : undefined });\n        }\n        setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));''',
)

# ---------------- Financeiro: sincronizar sob demanda, sem mandar o usuário sair da tela ----------------
replace_exact(
    "src/finance-ultimate.tsx",
    'import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";',
    'import { reconcileCloud, safePullFromCloud } from "./cloud-safe-sync";',
)
replace_exact(
    "src/finance-ultimate.tsx",
    '''function paymentForInvoice(database: SchoolDatabase, invoiceId: string) {\n  return database.payments\n    .filter((item) => item.invoiceId === invoiceId && item.status === "confirmed")\n    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0] ?? null;\n}\n''',
    '''function paymentForInvoice(database: SchoolDatabase, invoiceId: string) {\n  return database.payments\n    .filter((item) => item.invoiceId === invoiceId && item.status === "confirmed")\n    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0] ?? null;\n}\n\nfunction resolveSyncedInvoice(database: SchoolDatabase, invoice: Invoice) {\n  return database.invoices.find((item) => item.id === invoice.id)\n    ?? database.invoices.find((item) => item.studentId === invoice.studentId && item.reference === invoice.reference)\n    ?? null;\n}\n''',
)

# Pagamento manual: sincroniza antes e recalcula com os dados canônicos.
replace_section(
    "src/finance-ultimate.tsx",
    '  const confirmPayment = () => void (async () => {',
    '  const reopenPayment = (invoice: Invoice) => void (async () => {',
    '''  const confirmPayment = () => void (async () => {\n    if (!modal || modal.kind !== "pay" || busy) return;\n    const currentModal = modal;\n    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";\n\n    if (schoolId) {\n      setBusy(true);\n      setNotice({ tone: "warning", text: "Conferindo a nuvem automaticamente antes de registrar o pagamento..." });\n      try {\n        const reconciled = await reconcileCloud(schoolId, database);\n        if (reconciled.database !== database) onChange(reconciled.database);\n        const syncedInvoice = resolveSyncedInvoice(reconciled.database, currentModal.invoice);\n        if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n        if (["paid", "cancelled", "negotiated"].includes(syncedInvoice.status)) {\n          throw new Error(syncedInvoice.status === "paid"\n            ? "Esta mensalidade já consta como paga na nuvem. A tela foi atualizada para impedir cobrança ou baixa duplicada."\n            : "Esta mensalidade não está mais disponível para pagamento.");\n        }\n        const breakdown = invoiceAmountDue(syncedInvoice, reconciled.database.settings.finance);\n        const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), breakdown.totalDue);\n        const amountReceived = Math.round((breakdown.totalDue - safeDiscount) * 100) / 100;\n        if (amountReceived <= 0) throw new Error("O valor final do pagamento precisa ser maior que zero.");\n        const payment = await confirmManualInvoicePayment({ schoolId, invoiceId: syncedInvoice.id, method: paymentMethod, discount: safeDiscount });\n        const restored = await safePullFromCloud(schoolId, reconciled.database.settings.appearance);\n        onChange(restored);\n        const paidInvoice = restored.invoices.find((item) => item.id === payment.invoiceId) ?? resolveSyncedInvoice(restored, syncedInvoice) ?? { ...syncedInvoice, status: "paid" as const, paidAt: payment.paidAt };\n        setModal(null);\n        setNotice({ tone: "success", text: `Pagamento de ${money(payment.amountReceived)} confirmado no servidor. Recibo ${payment.receiptNumber ?? payment.id}.` });\n        onReceipt(currentModal.student, paidInvoice, payment);\n      } catch (error) {\n        setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." });\n      } finally { setBusy(false); }\n      return;\n    }\n\n    const breakdown = invoiceAmountDue(currentModal.invoice, database.settings.finance);\n    const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), breakdown.totalDue);\n    const amountReceived = Math.round((breakdown.totalDue - safeDiscount) * 100) / 100;\n    if (amountReceived <= 0) {\n      setNotice({ tone: "danger", text: "O valor final do pagamento precisa ser maior que zero." });\n      return;\n    }\n    const now = new Date().toISOString();\n    const payment: Payment = {\n      id: makeId("pagamento"), studentId: currentModal.student.id, invoiceId: currentModal.invoice.id,\n      amountReceived, principalAmount: breakdown.baseAmount, lateFeeAmount: breakdown.lateFee,\n      interestAmount: breakdown.interest, discountAmount: safeDiscount, paymentMethod,\n      status: "confirmed", paidAt: now, receiptNumber: localReceiptNumber(),\n      notes: "Pagamento registrado em modo local/offline.", reversedAt: null, reversalReason: "", createdAt: now,\n    };\n    const next = replaceDatabase(database, (draft) => {\n      const invoice = draft.invoices.find((item) => item.id === currentModal.invoice.id);\n      if (!invoice) return;\n      invoice.status = "paid";\n      invoice.paidAt = now;\n      draft.payments.push(payment);\n    });\n    onChange(next);\n    setModal(null);\n    setNotice({ tone: "warning", text: `Pagamento registrado apenas neste dispositivo. Recibo ${payment.receiptNumber}. Quando a internet voltar, o AulaFácil sincronizará automaticamente.` });\n    onReceipt(currentModal.student, { ...currentModal.invoice, status: "paid", paidAt: now }, payment);\n  })();\n\n''',
)

replace_exact(
    "src/finance-ultimate.tsx",
    '''        const syncStatus = await getCloudSyncStatus(schoolId, database);\n        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de reabrir o pagamento.");\n        await reopenInvoicePayment({ schoolId, invoiceId: invoice.id, reason: "Pagamento marcado como pago por engano" });\n        onChange(await safePullFromCloud(schoolId, database.settings.appearance));''',
    '''        const reconciled = await reconcileCloud(schoolId, database);\n        if (reconciled.database !== database) onChange(reconciled.database);\n        const syncedInvoice = resolveSyncedInvoice(reconciled.database, invoice);\n        if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n        await reopenInvoicePayment({ schoolId, invoiceId: syncedInvoice.id, reason: "Pagamento marcado como pago por engano" });\n        onChange(await safePullFromCloud(schoolId, reconciled.database.settings.appearance));''',
)
replace_exact(
    "src/finance-ultimate.tsx",
    '''      const syncStatus = await getCloudSyncStatus(schoolId, database);\n      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de solicitar o estorno.");\n      const result = await requestProviderRefund({ paymentId: modal.payment.id, amount, reason: refundReason });\n      const restored = await safePullFromCloud(schoolId, database.settings.appearance);''',
    '''      const reconciled = await reconcileCloud(schoolId, database);\n      if (reconciled.database !== database) onChange(reconciled.database);\n      const syncedPayment = reconciled.database.payments.find((item) => item.id === modal.payment.id) ?? modal.payment;\n      const result = await requestProviderRefund({ paymentId: syncedPayment.id, amount, reason: refundReason });\n      const restored = await safePullFromCloud(schoolId, reconciled.database.settings.appearance);''',
)
replace_exact(
    "src/finance-ultimate.tsx",
    '''      const syncStatus = await getCloudSyncStatus(schoolId, database);\n      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de gerar Pix ou boleto. Isso evita misturar uma cobrança antiga com alterações locais ainda não enviadas.");\n      await saveBillingProfile(schoolId, modal.student.id, billing);\n      const charge = await generateProviderCharge({ invoiceId: modal.invoice.id, method: chargeMethod, billingProfile: billing });\n      setGeneratedCharge(charge);\n      onChange(await safePullFromCloud(schoolId, database.settings.appearance));''',
    '''      const reconciled = await reconcileCloud(schoolId, database);\n      if (reconciled.database !== database) onChange(reconciled.database);\n      const syncedInvoice = resolveSyncedInvoice(reconciled.database, modal.invoice);\n      if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n      if (["paid", "cancelled", "negotiated"].includes(syncedInvoice.status)) {\n        setModal({ ...modal, invoice: syncedInvoice });\n        throw new Error(syncedInvoice.status === "paid"\n          ? "Esta mensalidade já consta como paga na nuvem. O AulaFácil atualizou a tela e bloqueou uma cobrança duplicada."\n          : "Esta mensalidade não está mais disponível para gerar Pix ou boleto.");\n      }\n      await saveBillingProfile(schoolId, modal.student.id, billing);\n      const charge = await generateProviderCharge({ invoiceId: syncedInvoice.id, method: chargeMethod, billingProfile: billing });\n      setGeneratedCharge(charge);\n      onChange(await safePullFromCloud(schoolId, reconciled.database.settings.appearance));''',
)
replace_exact(
    "src/finance-ultimate.tsx",
    '''        const syncStatus = await getCloudSyncStatus(schoolId, database);\n        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de cancelar a mensalidade. O cancelamento foi bloqueado para não deixar Pix ou boleto ativo no provedor.");\n        const result = await cancelProviderCharge({ invoiceId: invoice.id, cancelInvoice: true, reason: "Cancelada manualmente no financeiro" });\n        onChange(await safePullFromCloud(schoolId, database.settings.appearance));''',
    '''        const reconciled = await reconcileCloud(schoolId, database);\n        if (reconciled.database !== database) onChange(reconciled.database);\n        const syncedInvoice = resolveSyncedInvoice(reconciled.database, invoice);\n        if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n        const result = await cancelProviderCharge({ invoiceId: syncedInvoice.id, cancelInvoice: true, reason: "Cancelada manualmente no financeiro" });\n        onChange(await safePullFromCloud(schoolId, reconciled.database.settings.appearance));''',
)
replace_exact(
    "src/finance-ultimate.tsx",
    '''      const syncStatus = await getCloudSyncStatus(schoolId, database);\n      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de remover a cobrança bancária para reemissão.");\n      const result = await cancelProviderCharge({ invoiceId: modal.invoice.id, cancelInvoice: false, reason: "Cobrança bancária removida para reemissão" });\n      const restored = await safePullFromCloud(schoolId, database.settings.appearance);''',
    '''      const reconciled = await reconcileCloud(schoolId, database);\n      if (reconciled.database !== database) onChange(reconciled.database);\n      const syncedInvoice = resolveSyncedInvoice(reconciled.database, modal.invoice);\n      if (!syncedInvoice) throw new Error("A mensalidade não foi encontrada depois da sincronização automática.");\n      const result = await cancelProviderCharge({ invoiceId: syncedInvoice.id, cancelInvoice: false, reason: "Cobrança bancária removida para reemissão" });\n      const restored = await safePullFromCloud(schoolId, reconciled.database.settings.appearance);''',
)

# ---------------- Painel da nuvem: deixa claro que o botão é opcional ----------------
replace_exact(
    "src/cloud-sync-panel.tsx",
    '  local_changed: { title: "Há mudanças para enviar", text: "Elas já estão salvas neste computador. Sincronize para atualizar também a nuvem." },\n  cloud_changed: { title: "Há novidades para baixar", text: "A nuvem mudou em outro dispositivo ou automação. Sincronize para receber as alterações." },',
    '  local_changed: { title: "Sincronização automática em andamento", text: "As alterações estão salvas neste computador e serão enviadas automaticamente para a nuvem." },\n  cloud_changed: { title: "Há novidades na nuvem", text: "O AulaFácil baixa automaticamente as alterações quando a conexão está disponível." },',
)
replace_exact(
    "src/cloud-sync-panel.tsx",
    '<div className="cloud-sync-plain-note"><strong>No uso normal, é simples:</strong> clique apenas em “Sincronizar agora”. As opções de escolher uma cópia só aparecem quando existe algo que precisa da sua decisão.</div>',
    '<div className="cloud-sync-plain-note"><strong>No uso normal, você não precisa fazer nada:</strong> o AulaFácil sincroniza sozinho ao abrir, depois de alterações e quando a internet volta. O botão abaixo serve apenas para forçar uma conferência imediata.</div>',
)
replace_exact(
    "src/cloud-sync-panel.tsx",
    '{busy ? "Sincronizando..." : "Sincronizar agora"}',
    '{busy ? "Sincronizando..." : "Sincronizar agora (opcional)"}',
)

# ---------------- Versão 0.4.17 ----------------
package = ROOT / "package.json"
data = json.loads(package.read_text(encoding="utf-8"))
data["version"] = "0.4.17"
package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lock = ROOT / "package-lock.json"
lock_data = json.loads(lock.read_text(encoding="utf-8"))
lock_data["version"] = "0.4.17"
if isinstance(lock_data.get("packages"), dict) and "" in lock_data["packages"]:
    lock_data["packages"][""]["version"] = "0.4.17"
lock.write_text(json.dumps(lock_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

replace_exact("src-tauri/tauri.conf.json", '"version": "0.4.16"', '"version": "0.4.17"')
replace_exact("src-tauri/Cargo.toml", 'version = "0.4.16"', 'version = "0.4.17"')

cargo_lock = ROOT / "src-tauri/Cargo.lock"
lock_text = cargo_lock.read_text(encoding="utf-8")n
