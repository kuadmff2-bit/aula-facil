from pathlib import Path

p = Path('supabase/functions/payment-charge/index.ts')
text = p.read_text(encoding='utf-8')
old = '''    if (leaseToken) await admin.rpc("service_fail_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method, target_lease_token: leaseToken, target_error: message }).catch(() => undefined);'''
new = '''    if (leaseToken) {
      try {
        await admin.rpc("service_fail_payment_charge_attempt", { target_invoice: invoice.id, target_connection: connection.id, target_method: method, target_lease_token: leaseToken, target_error: message });
      } catch {
        // Falha ao registrar a tentativa nunca deve esconder o erro original do provedor.
      }
    }'''
if old not in text:
    raise SystemExit('Trecho esperado não encontrado; abortando para não alterar código incorreto.')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Correção do tratamento de falha aplicada.')
