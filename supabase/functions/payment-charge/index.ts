import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Method = "pix" | "boleto";
type BillingProfile = {
  payer_name: string;
  email: string;
  document_number: string;
  phone: string;
  postal_code: string;
  street_name: string;
  street_number: string;
  neighborhood: string;
  city: string;
  state: string;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function digits(value: unknown) { return clean(value, 100).replace(/\D/g, ""); }
function normalizeBrazilPhone(value: unknown) {
  let valueDigits = digits(value);
  if ((valueDigits.length === 12 || valueDigits.length === 13) && valueDigits.startsWith("55")) valueDigits = valueDigits.slice(2);
  return valueDigits.slice(0, 30);
}
function sanitizeProfile(value: unknown): Partial<BillingProfile> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  return {
    payer_name: clean(v.payer_name, 180),
    email: clean(v.email, 200),
    document_number: digits(v.document_number).slice(0, 30),
    phone: normalizeBrazilPhone(v.phone),
    postal_code: digits(v.postal_code).slice(0, 12),
    street_name: clean(v.street_name, 200),
    street_number: clean(v.street_number, 40),
    neighborhood: clean(v.neighborhood, 120),
    city: clean(v.city, 120),
    state: clean(v.state, 10).toUpperCase(),
  };
}
function allSame(value:string){return /^(\d)\1+$/.test(value)}
function validCpf(value:string){
  if(!/^\d{11}$/.test(value)||allSame(value))return false;
  const calc=(base:string,factor:number)=>{let sum=0;for(const ch of base)sum+=Number(ch)*factor--;const r=(sum*10)%11;return r===10?0:r};
  const d1=calc(value.slice(0,9),10);if(d1!==Number(value[9]))return false;
  const d2=calc(value.slice(0,10),11);return d2===Number(value[10]);
}
function validCnpj(value:string){
  if(!/^\d{14}$/.test(value)||allSame(value))return false;
  const calc=(base:string,weights:number[])=>{const sum=base.split("").reduce((acc,ch,i)=>acc+Number(ch)*weights[i],0);const r=sum%11;return r<2?0:11-r};
  const w1=[5,4,3,2,9,8,7,6,5,4,3,2];const d1=calc(value.slice(0,12),w1);if(d1!==Number(value[12]))return false;
  const w2=[6,5,4,3,2,9,8,7,6,5,4,3,2];const d2=calc(value.slice(0,13),w2);return d2===Number(value[13]);
}
function validateProfileValues(profile:BillingProfile){
  if(profile.document_number){
    if(profile.document_number.length!==11&&profile.document_number.length!==14)throw new Error("CPF/CNPJ inválido: informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.");
    if(profile.document_number.length===11&&!validCpf(profile.document_number))throw new Error("CPF inválido: os dígitos verificadores não conferem.");
    if(profile.document_number.length===14&&!validCnpj(profile.document_number))throw new Error("CNPJ inválido: os dígitos verificadores não conferem.");
  }
  if(profile.postal_code&&profile.postal_code.length!==8)throw new Error("CEP inválido: informe exatamente 8 dígitos.");
  if(profile.phone&&(profile.phone.length!==10&&profile.phone.length!==11))throw new Error("Telefone inválido: informe DDD + número com 10 ou 11 dígitos.");
  if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))throw new Error("E-mail de cobrança inválido. Confira o endereço informado.");
  if(profile.state&&!/^[A-Z]{2}$/.test(profile.state))throw new Error("UF inválida: informe exatamente 2 letras, por exemplo AM.");
}
function requireProfile(profile: any, fields: Array<keyof BillingProfile>, provider: string) {
  const missing = fields.filter((field) => !String(profile?.[field] ?? "").trim());
  if (missing.length) throw new Error(`${provider} exige dados de faturamento adicionais: ${missing.join(", ")}.`);
}
function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || name, last: parts.slice(1).join(" ") || "." };
}
function pagarmePhone(phone: string) {
  const value = normalizeBrazilPhone(phone);
  if (value.length < 10) return undefined;
  return { mobile_phone: { country_code: "55", area_code: value.slice(0, 2), number: value.slice(2) } };
}
function decodeSecret(value: unknown) {
  if (typeof value !== "string" || !value) throw new Error("Credenciais do provedor não encontradas.");
  const parsed = JSON.parse(value);
  if (!parsed?.credentials || typeof parsed.credentials !== "object") throw new Error("Credenciais do provedor estão inválidas.");
  return parsed.credentials as Record<string, string>;
}
async function jsonFetch(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerDetail = data?.errors?.[0]?.description ?? data?.message ?? data?.error_description ?? data?.error ?? JSON.stringify(data).slice(0,500);
    throw new Error(`Provedor respondeu ${response.status}${providerDetail ? `: ${String(providerDetail).slice(0,500)}` : ""}`);
  }
  return data;
}
async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply(401, { error: "Sessão ausente." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Backend financeiro indisponível." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "Sessão inválida ou expirada." });

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { error: "JSON inválido." }); }
  const invoiceId = clean(body?.invoiceId, 80);
  const requestedConnectionId = clean(body?.connectionId, 80);
  const method = clean(body?.method, 20) as Method;
  if (!invoiceId || !["pix", "boleto"].includes(method)) return reply(400, { error: "Cobrança e método de pagamento são obrigatórios." });

  const { data: invoice, error: invoiceError } = await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invoiceError) return reply(500, { error: `Não foi possível carregar a cobrança: ${invoiceError.message}` });
  if (!invoice) return reply(404, { error: "Cobrança não encontrada." });
  if (["paid", "cancelled", "negotiated"].includes(invoice.status)) return reply(409, { error: "Esta cobrança não está disponível para uma nova emissão." });

  const { data: student, error: studentError } = await admin.from("students").select("*").eq("id",invoice.student_id).eq("school_id",invoice.school_id).maybeSingle();
  if(studentError)return reply(500,{error:`Não foi possível carregar o aluno da cobrança: ${studentError.message}`});
  if (!student?.id) return reply(409, { error: "Aluno da cobrança não foi encontrado." });

  const { data: member } = await admin.from("school_members").select("role,active").eq("school_id", invoice.school_id).eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || !["owner", "admin", "finance"].includes(member.role)) return reply(403, { error: "Seu usuário não possui permissão financeira para gerar cobranças." });

  const profilePatch = sanitizeProfile(body?.billingProfile);
  const existingProfileResult=await admin.from("student_billing_profiles").select("*").eq("school_id", invoice.school_id).eq("student_id", student.id).maybeSingle();
  if(existingProfileResult.error)return reply(500,{error:"Não foi possível carregar os dados de faturamento."});
  const previewProfile={
    payer_name:"",email:"",document_number:"",phone:normalizeBrazilPhone(student.phone??""),postal_code:"",street_name:"",street_number:"",neighborhood:"",city:"",state:"",
    ...(existingProfileResult.data??{}),...profilePatch,
  } as BillingProfile;
  try{validateProfileValues(previewProfile)}catch(error){return reply(422,{error:String(error instanceof Error?error.message:error)});}

  if (Object.values(profilePatch).some(Boolean)) {
    const { error } = await admin.from("student_billing_profiles").upsert({ school_id: invoice.school_id, student_id: student.id, ...profilePatch }, { onConflict: "school_id,student_id" });
    if (error) return reply(500, { error: "Não foi possível salvar os dados de faturamento." });
  }
  const profile = previewProfile;
  const payerName = clean(profile.payer_name, 180) || clean(student.name, 180) || "Pagador";

  const existingMetadata: any = invoice.provider_metadata && typeof invoice.provider_metadata === "object" ? invoice.provider_metadata : {};
  if (invoice.provider_charge_id) {
    const existingMethod = String(existingMetadata.method ?? "");
    const existingConnectionId = String(existingMetadata.connectionId ?? "");
    if (existingMethod && existingMethod !== method) return reply(409, { error: `Esta mensalidade já possui uma cobrança ${existingMethod === "pix" ? "Pix" : "boleto"}. O AulaFácil não criará outra cobrança paralela automaticamente.` });
    if (requestedConnectionId && existingConnectionId && requestedConnectionId !== existingConnectionId) return reply(409, { error: "Esta mensalidade já possui uma cobrança em outro provedor/conexão. Cancele ou conclua a cobrança existente antes de trocar de provedor." });
    return reply(200, { ok: true, reused: true, provider: invoice.provider, providerChargeId: invoice.provider_charge_id, pixCopyPaste: invoice.pix_copy_paste, pixQrCodeBase64: invoice.pix_qr_code_base64, boletoUrl: invoice.boleto_url, paymentUrl: invoice.payment_url, amount: Number(existingMetadata.amount ?? invoice.amount), metadata: existingMetadata });
  }

  const capabilityColumn = method === "pix" ? "supports_pix" : "supports_boleto";
  let connectionQuery = admin.from("payment_connections").select("*").eq("school_id", invoice.school_id).eq("enabled", true).eq(capabilityColumn, true);
  if (requestedConnectionId) connectionQuery = connectionQuery.eq("id", requestedConnectionId);
  const defaultColumn = method === "pix" ? "default_for_pix" : "default_for_boleto";
  const { data: candidates, error: connectionError } = await connectionQuery.order(defaultColumn, { ascending: false }).order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(10);
  if (connectionError) return reply(500, { error: "Não foi possível escolher o provedor de pagamento." });
  const connection = (candidates ?? []).find((item: any) => item.provider_key === "manual_pix" || item.credentials_configured);
  if (!connection) return reply(409, { error: `Nenhum provedor ativo e configurado está pronto para ${method === "pix" ? "Pix" : "boleto"}.` });

  const credentialValidation=String(connection.public_config?.credentialValidation??"");
  if(connection.provider_key!=="manual_pix"&&credentialValidation&&credentialValidation!=="validated")return reply(409,{error:"As credenciais desta conexão ainda não foram validadas pelo provedor. Abra Configurações → Recebimentos e salve novamente a API para validar."});

  const { data: claimData, error: claimError } = await admin.rpc("service_claim_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method });
  if (claimError) return reply(500, { error: "Não foi possível reservar a emissão da cobrança com segurança." });
  const claim: any = claimData ?? {};
  if (claim.action === "busy") return reply(409, { error: "Esta cobrança já está sendo gerada em outra tentativa. Aguarde alguns segundos e tente novamente; o AulaFácil não criará uma duplicata." });
  const leaseToken = claim.action === "claimed" ? String(claim.leaseToken ?? "") : "";

  const today = new Date().toISOString().slice(0, 10);
  const { data: dueRows, error: dueError } = await admin.rpc("invoice_amount_due", { target_invoice: invoice.id, as_of: today });
  if (dueError) return reply(500, { error: "Não foi possível calcular o valor atualizado da cobrança." });
  const due = Array.isArray(dueRows) ? dueRows[0] : dueRows;
  const calculatedAmount = Number(due?.total_due ?? invoice.amount);
  if (!Number.isFinite(calculatedAmount) || calculatedAmount <= 0) return reply(409, { error: "Valor de cobrança inválido." });
  const dueDate = String(invoice.due_date) < today ? today : String(invoice.due_date);

  const normalized: any = { provider: connection.provider_key, providerChargeId: claim.action === "reuse" ? String(claim.providerChargeId ?? "") : null, pixCopyPaste: null, pixQrCodeBase64: null, boletoUrl: null, paymentUrl: null, metadata: { method, connectionId: connection.id, amount: calculatedAmount, generatedAt: new Date().toISOString() } };

  const persistBase = async () => {
    const { error } = await admin.from("invoices").update({ provider: normalized.provider, provider_charge_id: normalized.providerChargeId, pix_copy_paste: normalized.pixCopyPaste, pix_qr_code_base64: normalized.pixQrCodeBase64, boleto_url: normalized.boletoUrl, payment_url: normalized.paymentUrl, provider_metadata: normalized.metadata }).eq("id", invoice.id).is("provider_charge_id", null);
    if (error) throw error;
    const { data: check } = await admin.from("invoices").select("provider_charge_id").eq("id", invoice.id).single();
    if (!check?.provider_charge_id) throw new Error("A cobrança foi criada no provedor, mas o identificador não pôde ser persistido no AulaFácil.");
  };

  try {
    if (connection.provider_key === "manual_pix") {
      if (method !== "pix") throw new Error("Pix manual não emite boleto.");
      const pixKey = clean(connection.public_config?.pixKey, 180);
      if (!pixKey) throw new Error("A chave Pix manual não está configurada.");
      normalized.metadata.manualPixKey = pixKey;
      normalized.metadata.recipientName = clean(connection.public_config?.recipientName, 160);
      normalized.providerChargeId = `manual:${invoice.id}`;
      await persistBase();
    } else {
      const { data: secretText, error: secretError } = await admin.rpc("service_get_payment_connection_secret", { target_connection_id: connection.id });
      if (secretError) throw secretError;
      const credentials = decodeSecret(secretText);

      if (connection.provider_key === "asaas") {
        requireProfile(profile, ["document_number"], "Asaas");
        const apiKey = credentials.api_key;
        if (!apiKey) throw new Error("API Key do Asaas não configurada.");
        const base = connection.environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
        const headers = { "Content-Type": "application/json", "User-Agent":"AulaFacil/0.4.15", access_token: apiKey };

        let { data: mapping } = await admin.from("provider_customers").select("provider_customer_id,payer_document,payer_name").eq("connection_id", connection.id).eq("student_id", student.id).maybeSingle();
        let providerCustomerId = String(mapping?.provider_customer_id ?? "");
        if(mapping&&String(mapping.payer_document??"")!==profile.document_number)providerCustomerId="";

        if (!providerCustomerId) {
          const listed = await jsonFetch(`${base}/customers?externalReference=${encodeURIComponent(student.id)}&limit=100`, { headers });
          const matches = Array.isArray(listed?.data) ? listed.data : [];
          const recovered = matches.find((item: any) => digits(item?.cpfCnpj) === profile.document_number) ?? null;
          providerCustomerId = String(recovered?.id ?? "");
        }

        const customerPayload = { name: payerName, cpfCnpj: profile.document_number, email: profile.email || undefined, mobilePhone: profile.phone || undefined, postalCode: profile.postal_code || undefined, address: profile.street_name || undefined, addressNumber: profile.street_number || undefined, province: profile.neighborhood || undefined, externalReference: student.id, notificationDisabled: true };

        if (providerCustomerId) {
          try { await jsonFetch(`${base}/customers/${encodeURIComponent(providerCustomerId)}`, { method: "PUT", headers, body: JSON.stringify(customerPayload) }); }
          catch (error) { if (!String(error).includes("404")) throw error; providerCustomerId = ""; }
        }
        if (!providerCustomerId) {
          const customer = await jsonFetch(`${base}/customers`, { method: "POST", headers, body: JSON.stringify(customerPayload) });
          providerCustomerId = String(customer.id ?? "");
          if (!providerCustomerId) throw new Error("Asaas não retornou o identificador do cliente.");
        }
        const { error: mapError } = await admin.from("provider_customers").upsert({ connection_id: connection.id, school_id: invoice.school_id, student_id: student.id, provider_customer_id: providerCustomerId, payer_document: profile.document_number, payer_name: payerName, updated_at: new Date().toISOString() }, { onConflict: "connection_id,student_id" });
        if (mapError) throw mapError;

        const billingType = method === "pix" ? "PIX" : "BOLETO";
        let providerPayment: any = null;
        const previous = await jsonFetch(`${base}/payments?externalReference=${encodeURIComponent(invoice.id)}&limit=100`, { headers });
        const priorRows = Array.isArray(previous?.data) ? previous.data : [];
        providerPayment = priorRows.find((item: any) => String(item?.customer ?? "") === providerCustomerId && String(item?.billingType ?? "") === billingType) ?? null;
        if (!providerPayment && priorRows.length) throw new Error("O Asaas já possui outra cobrança vinculada a esta mensalidade. O AulaFácil bloqueou uma nova emissão para evitar duplicidade.");

        if (!providerPayment) providerPayment = await jsonFetch(`${base}/payments`, { method: "POST", headers, body: JSON.stringify({ customer: providerCustomerId, billingType, value: calculatedAmount, dueDate, description: `${invoice.reference} - ${student.name}`.slice(0, 500), externalReference: invoice.id }) });
        else normalized.metadata.recoveredFromProvider = true;

        normalized.providerChargeId = String(providerPayment?.id ?? "");
        if (!normalized.providerChargeId) throw new Error("Asaas não retornou o identificador da cobrança.");
        const providerAmount = Number(providerPayment?.value ?? calculatedAmount);
        normalized.metadata.amount = Number.isFinite(providerAmount) && providerAmount > 0 ? providerAmount : calculatedAmount;
        normalized.metadata.providerStatus = providerPayment?.status ?? null;
        normalized.paymentUrl = providerPayment?.invoiceUrl || providerPayment?.paymentLink || null;
        if (method === "boleto") normalized.boletoUrl = providerPayment?.bankSlipUrl || providerPayment?.invoiceUrl || null;

        await persistBase();
        if (leaseToken) await admin.rpc("service_complete_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method, target_lease_token: leaseToken, target_provider_charge_id: normalized.providerChargeId });

        if (method === "pix") {
          let qr: any = null; let lastQrError = "";
          for (let attempt = 0; attempt < 2 && !qr; attempt++) {
            try { qr = await jsonFetch(`${base}/payments/${encodeURIComponent(normalized.providerChargeId)}/pixQrCode`, { method: "GET", headers }); }
            catch (error) { lastQrError = String(error instanceof Error ? error.message : error); if (attempt === 0) await sleep(350); }
          }
          if (qr) {
            normalized.pixCopyPaste = qr.payload || null;
            normalized.pixQrCodeBase64 = qr.encodedImage || null;
            normalized.metadata.expirationDate = qr.expirationDate || null;
            const { error: artifactError } = await admin.from("invoices").update({ pix_copy_paste: normalized.pixCopyPaste, pix_qr_code_base64: normalized.pixQrCodeBase64, provider_metadata: normalized.metadata }).eq("id", invoice.id);
            if (artifactError) normalized.metadata.artifactWarning = "QR Pix gerado, mas a cópia local dos artefatos precisará ser recuperada.";
          } else {
            normalized.metadata.artifactWarning = `Cobrança criada com segurança, mas o QR Pix ainda não pôde ser consultado: ${lastQrError.slice(0, 300)}`;
            await admin.from("invoices").update({ provider_metadata: normalized.metadata }).eq("id", invoice.id);
          }
        }
      } else if (connection.provider_key === "mercado_pago") {
        requireProfile(profile, method === "boleto" ? ["email", "document_number", "postal_code", "street_name", "street_number", "neighborhood", "city", "state"] : ["email", "document_number"], "Mercado Pago");
        const accessToken = credentials.access_token;
        if (!accessToken) throw new Error("Access Token do Mercado Pago não configurado.");
        const names = splitName(payerName);
        const payer: any = { email: profile.email, first_name: names.first, last_name: names.last, identification: { type: profile.document_number.length > 11 ? "CNPJ" : "CPF", number: profile.document_number } };
        if (method === "boleto") payer.address = { zip_code: profile.postal_code, street_name: profile.street_name, street_number: profile.street_number, neighborhood: profile.neighborhood, city: profile.city, federal_unit: profile.state };
        const webhookToken = clean(credentials.webhook_token, 300);
        if (!webhookToken) throw new Error("A conexão do Mercado Pago não possui token seguro de webhook. Salve novamente as credenciais da conexão antes de gerar cobranças.");
        const notificationUrl = `${url}/functions/v1/payment-webhook?provider=mercado_pago&connection=${encodeURIComponent(connection.id)}&hook=${encodeURIComponent(webhookToken)}`;
        const payment = await jsonFetch("https://api.mercadopago.com/v1/payments", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${invoice.id}-${connection.id}-${method}` }, body: JSON.stringify({ transaction_amount: calculatedAmount, description: `${invoice.reference} - ${student.name}`.slice(0, 255), payment_method_id: method === "pix" ? "pix" : "bolbradesco", payer, external_reference: invoice.id, notification_url: notificationUrl }) });
        normalized.metadata.notificationUrlConfigured = true;
        normalized.providerChargeId = String(payment.id ?? "");
        if (!normalized.providerChargeId) throw new Error("Mercado Pago não retornou o identificador da cobrança.");
        normalized.metadata.status = payment.status ?? null;
        if (method === "pix") { const tx = payment.point_of_interaction?.transaction_data ?? {}; normalized.pixCopyPaste = tx.qr_code || null; normalized.pixQrCodeBase64 = tx.qr_code_base64 || null; normalized.paymentUrl = tx.ticket_url || null; }
        else { normalized.boletoUrl = payment.transaction_details?.external_resource_url || payment.point_of_interaction?.transaction_data?.ticket_url || null; normalized.paymentUrl = normalized.boletoUrl; }
        await persistBase();
      } else if (connection.provider_key === "pagarme") {
        requireProfile(profile, method === "boleto" ? ["email", "document_number", "phone", "postal_code", "street_name", "street_number", "neighborhood", "city", "state"] : ["email", "document_number", "phone"], "Pagar.me");
        const secretKey = credentials.secret_key;
        if (!secretKey) throw new Error("Secret Key do Pagar.me não configurada.");
        const address = profile.postal_code ? { line_1: `${profile.street_number}, ${profile.street_name}, ${profile.neighborhood}`.slice(0, 255), zip_code: profile.postal_code, city: profile.city, state: profile.state, country: "BR" } : undefined;
        const customer: any = { name: payerName, email: profile.email, document: profile.document_number, document_type: profile.document_number.length > 11 ? "CNPJ" : "CPF", type: profile.document_number.length > 11 ? "company" : "individual", phones: pagarmePhone(profile.phone) };
        if (address) customer.address = address;
        const paymentConfig = method === "pix" ? { payment_method: "pix", pix: { expires_in: 86400 } } : { payment_method: "boleto", boleto: { instructions: "Pagar até o vencimento", due_at: `${dueDate}T23:59:59Z`, document_number: invoice.id.slice(0, 30), type: "DM" } };
        const order = await jsonFetch("https://api.pagar.me/core/v5/orders", { method: "POST", headers: { Authorization: `Basic ${btoa(`${secretKey}:`)}`, "Content-Type": "application/json", "Idempotency-Key": `${invoice.id}-${connection.id}-${method}` }, body: JSON.stringify({ code: invoice.id.slice(0, 52), items: [{ amount: Math.round(calculatedAmount * 100), description: invoice.reference.slice(0, 255), quantity: 1, code: invoice.id.slice(0, 52) }], customer, payments: [paymentConfig], closed: true, metadata: { aulafacil_invoice_id: invoice.id } }) });
        const charge = Array.isArray(order.charges) ? order.charges[0] : null; const tx = charge?.last_transaction ?? {};
        normalized.providerChargeId = String(charge?.id ?? order.id ?? "");
        if (!normalized.providerChargeId) throw new Error("Pagar.me não retornou o identificador da cobrança.");
        normalized.metadata.orderId = order.id ?? null;
        if (method === "pix") { normalized.pixCopyPaste = tx.qr_code || tx.qr_code_text || null; normalized.paymentUrl = tx.qr_code_url || tx.url || null; }
        else { normalized.boletoUrl = tx.pdf || tx.url || null; normalized.paymentUrl = tx.url || tx.pdf || null; normalized.metadata.line = tx.line || null; normalized.metadata.barcode = tx.barcode || null; }
        await persistBase();
      } else if (connection.provider_key === "efi") throw new Error("A Efí exige autenticação mTLS com certificado no servidor. O conector não será ativado até existir o serviço de certificado dedicado.");
      else if (connection.provider_key === "stripe") throw new Error("Para segurança PCI, o AulaFácil não recebe dados de cartão. O conector Stripe será usado apenas por checkout hospedado/tokenizado.");
      else throw new Error("Provedor ainda não possui adaptador de cobrança ativo.");
    }

    if (leaseToken && connection.provider_key !== "asaas") await admin.rpc("service_complete_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method, target_lease_token: leaseToken, target_provider_charge_id: normalized.providerChargeId });

    await admin.from("audit_logs").insert({ school_id: invoice.school_id, actor_user_id: userData.user.id, action: normalized.metadata.recoveredFromProvider ? "payment_charge_recovered" : "payment_charge_created", entity_type: "invoice", entity_id: invoice.id, metadata: { provider: normalized.provider, method, connection_id: connection.id, amount: normalized.metadata.amount, provider_charge_id: normalized.providerChargeId } });

    return reply(200, { ok: true, reused: Boolean(normalized.metadata.recoveredFromProvider || claim.action === "reuse"), provider: normalized.provider, providerChargeId: normalized.providerChargeId, pixCopyPaste: normalized.pixCopyPaste, pixQrCodeBase64: normalized.pixQrCodeBase64, boletoUrl: normalized.boletoUrl, paymentUrl: normalized.paymentUrl, amount: Number(normalized.metadata.amount ?? calculatedAmount), metadata: normalized.metadata });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 700);
    if (leaseToken) {
      try {
        await admin.rpc("service_fail_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method, target_lease_token: leaseToken, target_error: message });
      } catch {
        // Falha ao registrar a tentativa nunca deve esconder o erro original do provedor.
      }
    }
    await admin.from("audit_logs").insert({ school_id: invoice.school_id, actor_user_id: userData.user.id, action: "payment_charge_failed", entity_type: "invoice", entity_id: invoice.id, metadata: { provider: connection.provider_key, method, error: message } });
    return reply(422, { error: message || "O provedor não conseguiu gerar a cobrança." });
  }
});
