from pathlib import Path

path = Path("supabase/functions/payment-charge-link/index.ts")
text = path.read_text(encoding="utf-8")

old = '''  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) return reply(400, { error: "Cobrança não informada." });

  const chargeRes = await fetch(`${url}/functions/v1/payment-charge`, {
    method: "POST",
    headers: { Authorization: auth, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const chargeData = await chargeRes.json().catch(() => ({}));
  if (!chargeRes.ok) return reply(chargeRes.status, { error: chargeData?.error || chargeData?.detail || "Não foi possível gerar a cobrança." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = auth.slice(7);
  const { data: userData } = await db.auth.getUser(token);
  if (!userData.user) return reply(200, { ...chargeData, publicPaymentUrl: "", delivery: { attempted:false,status:"warning",recipient:"",message:"Cobrança criada, mas a sessão expirou antes de preparar o link do aluno." }, secondaryWarning:"Sessão expirada após a criação da cobrança." });

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select("id,school_id,student_id,status,reference,due_date,amount,provider_metadata")
    .eq("id", invoiceId)
    .maybeSingle();
'''

new = '''  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) return reply(400, { error: "Cobrança não informada." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = auth.slice(7);
  const { data: userData } = await db.auth.getUser(token);
  if (!userData.user) return reply(401, { error: "Sessão inválida ou expirada." });

  let resolvedInvoiceId = invoiceId;
  const { data: directInvoice, error: directInvoiceError } = await db
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (directInvoiceError) return reply(500, { error: `Não foi possível validar a cobrança: ${directInvoiceError.message}` });

  if (!directInvoice?.id) {
    const { data: memberships, error: membershipError } = await db
      .from("school_members")
      .select("school_id")
      .eq("user_id", userData.user.id)
      .eq("active", true);
    if (membershipError) return reply(500, { error: "Não foi possível validar as instituições da sua conta." });

    const schoolIds = (memberships ?? []).map((item: any) => String(item.school_id)).filter(Boolean);
    if (schoolIds.length) {
      const { data: aliases, error: aliasError } = await db
        .from("invoice_sync_aliases")
        .select("school_id,canonical_invoice_id")
        .eq("local_invoice_id", invoiceId)
        .in("school_id", schoolIds)
        .limit(2);
      if (aliasError) return reply(500, { error: "Não foi possível reconciliar o identificador antigo da cobrança." });
      if ((aliases ?? []).length > 1) return reply(409, { error: "Esta cobrança possui mais de um identificador reconciliado. Sincronize novamente antes de emitir." });
      const canonicalId = String(aliases?.[0]?.canonical_invoice_id ?? "");
      if (canonicalId) resolvedInvoiceId = canonicalId;
    }
  }

  const chargeBody = { ...body, invoiceId: resolvedInvoiceId };
  const chargeRes = await fetch(`${url}/functions/v1/payment-charge`, {
    method: "POST",
    headers: { Authorization: auth, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(chargeBody),
  });
  const chargeData = await chargeRes.json().catch(() => ({}));
  if (!chargeRes.ok) return reply(chargeRes.status, { error: chargeData?.error || chargeData?.detail || "Não foi possível gerar a cobrança." });

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select("id,school_id,student_id,status,reference,due_date,amount,provider_metadata")
    .eq("id", resolvedInvoiceId)
    .maybeSingle();
'''

if old not in text:
    raise SystemExit("Bloco principal esperado não encontrado em payment-charge-link/index.ts")

text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("payment-charge-link atualizado para resolver aliases antes da emissão")
