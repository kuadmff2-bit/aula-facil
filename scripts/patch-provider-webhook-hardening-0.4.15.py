from pathlib import Path

charge_path = Path('supabase/functions/payment-charge/index.ts')
charge = charge_path.read_text(encoding='utf-8')

old_mp = '''        const payment = await jsonFetch("https://api.mercadopago.com/v1/payments", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${invoice.id}-${connection.id}-${method}` }, body: JSON.stringify({ transaction_amount: calculatedAmount, description: `${invoice.reference} - ${student.name}`.slice(0, 255), payment_method_id: method === "pix" ? "pix" : "bolbradesco", payer, external_reference: invoice.id }) });'''
new_mp = '''        const webhookToken = clean(credentials.webhook_token, 300);
        if (!webhookToken) throw new Error("A conexão do Mercado Pago não possui token seguro de webhook. Salve novamente as credenciais da conexão antes de gerar cobranças.");
        const notificationUrl = `${url}/functions/v1/payment-webhook?provider=mercado_pago&connection=${encodeURIComponent(connection.id)}&hook=${encodeURIComponent(webhookToken)}`;
        const payment = await jsonFetch("https://api.mercadopago.com/v1/payments", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `${invoice.id}-${connection.id}-${method}` }, body: JSON.stringify({ transaction_amount: calculatedAmount, description: `${invoice.reference} - ${student.name}`.slice(0, 255), payment_method_id: method === "pix" ? "pix" : "bolbradesco", payer, external_reference: invoice.id, notification_url: notificationUrl }) });
        normalized.metadata.notificationUrlConfigured = true;'''

if old_mp not in charge:
    raise SystemExit('Trecho Mercado Pago esperado não encontrado; abortando sem alterar arquivo.')
charge = charge.replace(old_mp, new_mp, 1)
charge_path.write_text(charge, encoding='utf-8')

cred_path = Path('supabase/functions/payment-credentials/index.ts')
cred = cred_path.read_text(encoding='utf-8')

old_events = '''events:["PAYMENT_RECEIVED","PAYMENT_CONFIRMED"]'''
new_events = '''events:["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_REFUNDED","PAYMENT_PARTIALLY_REFUNDED","PAYMENT_REFUND_IN_PROGRESS","PAYMENT_REFUND_DENIED"]'''
if old_events not in cred:
    raise SystemExit('Lista de eventos Asaas esperada não encontrada; abortando sem alterar arquivo.')
cred = cred.replace(old_events, new_events, 1)

old_pagarme = '''else if(provider==="pagarme")webhookMode="webhook_pronto_com_conciliacao";'''
new_pagarme = '''else if(provider==="pagarme")webhookMode="dashboard_necessario_com_conciliacao";'''
if old_pagarme not in cred:
    raise SystemExit('Trecho Pagar.me esperado não encontrado; abortando sem alterar arquivo.')
cred = cred.replace(old_pagarme, new_pagarme, 1)
cred_path.write_text(cred, encoding='utf-8')

print('Hardening aplicado: Mercado Pago notification_url, Asaas refund events e status correto do webhook Pagar.me.')
