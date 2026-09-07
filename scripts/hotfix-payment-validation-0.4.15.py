from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrão não encontrado em {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Devolver ao frontend a confirmação real de validação do provedor.
replace_once(
    'src/payment-connections.ts',
    '''export async function configurePaymentCredentials(connectionId: string, credentials: Record<string, string>) {\n  await invokeCredentialAction(connectionId, "configure", credentials);\n}\n''',
    '''export async function configurePaymentCredentials(connectionId: string, credentials: Record<string, string>) {\n  return await invokeCredentialAction(connectionId, "configure", credentials);\n}\n''',
)

# 2) Mensagem explícita de API aceita + ambiente + fallback de webhook.
replace_once(
    'src/payment-connections-panel.tsx',
    '''      await configurePaymentCredentials(credentialConnection.id, payload);\n      setCredentialValues({});\n      setCredentialConnectionId("");\n      await refresh();\n      setMessage({ tone: "success", text: `Credenciais de ${credentialConnection.displayName} protegidas no servidor. O aplicativo não consegue lê-las de volta.` });''',
    '''      const validation = await configurePaymentCredentials(credentialConnection.id, payload);\n      setCredentialValues({});\n      setCredentialConnectionId("");\n      await refresh();\n      const providerName = String(validation?.providerName ?? credentialProvider.name);\n      const environmentLabel = validation?.environment === "sandbox" ? "Sandbox (teste)" : "Produção";\n      const webhookFallback = Boolean(validation?.warning);\n      setMessage({\n        tone: webhookFallback ? "warning" : "success",\n        text: webhookFallback\n          ? `✓ API do ${providerName} aceita e validada em ${environmentLabel}. As credenciais foram protegidas no servidor. O webhook não pôde ser ativado, então a confirmação automática usará a conciliação de segurança.`\n          : `✓ API do ${providerName} aceita e validada com sucesso em ${environmentLabel}. As credenciais foram protegidas no servidor e a conexão está pronta para uso.`,\n      });''',
)

replace_once(
    'src/payment-connections-panel.tsx',
    '''                <span>{connection.providerKey === "manual_pix" || connection.credentialsConfigured ? "Credenciais prontas" : "Credenciais pendentes"}</span>''',
    '''                <span>{connection.providerKey === "manual_pix"\n                  ? "✓ Pix manual pronto"\n                  : String(connection.publicConfig.credentialValidation ?? "") === "validated"\n                    ? "✓ API validada pelo provedor"\n                    : connection.credentialsConfigured\n                      ? "⚠ API salva — valide novamente"\n                      : "Credenciais pendentes"}</span>''',
)

replace_once(
    'src/payment-connections-panel.tsx',
    '''            <p>Esses valores serão enviados diretamente ao backend seguro e armazenados de forma protegida no servidor. Eles não entram no backup, no banco local nem no repositório.</p>''',
    '''            <p>Antes de salvar, o AulaFácil testa a credencial diretamente no provedor. Só uma API aceita será marcada como pronta. Os valores ficam protegidos no servidor e não entram no backup, no banco local nem no repositório.</p>''',
)

# 3) Validação local rigorosa para dados de cobrança.
insert_after = '''export const emptyBillingProfile = (): BillingProfile => ({\n  payerName: "", email: "", documentNumber: "", phone: "", postalCode: "", streetName: "",\n  streetNumber: "", neighborhood: "", city: "", state: "",\n});\n'''
validators = r'''

export type BillingProfileErrors = Partial<Record<keyof BillingProfile, string>>;

function repeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || repeatedDigits(value)) return false;
  const calculate = (base: string, factor: number) => {
    let sum = 0;
    for (const char of base) sum += Number(char) * factor--;
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const first = calculate(value.slice(0, 9), 10);
  if (first !== Number(value[9])) return false;
  return calculate(value.slice(0, 10), 11) === Number(value[10]);
}

function validCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || repeatedDigits(value)) return false;
  const calculate = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculate(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(value[12])) return false;
  return calculate(value.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(value[13]);
}

export function getBillingProfileErrors(profile: BillingProfile): BillingProfileErrors {
  const errors: BillingProfileErrors = {};
  const document = profile.documentNumber.replace(/\D/g, "");
  let phone = profile.phone.replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  const postalCode = profile.postalCode.replace(/\D/g, "");
  const state = profile.state.trim().toUpperCase();
  const email = profile.email.trim();

  if (document) {
    if (document.length !== 11 && document.length !== 14) errors.documentNumber = "Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.";
    else if (document.length === 11 && !validCpf(document)) errors.documentNumber = "CPF inválido: confira os dígitos.";
    else if (document.length === 14 && !validCnpj(document)) errors.documentNumber = "CNPJ inválido: confira os dígitos.";
  }
  if (postalCode && postalCode.length !== 8) errors.postalCode = "CEP inválido: informe exatamente 8 dígitos.";
  if (phone && phone.length !== 10 && phone.length !== 11) errors.phone = "Telefone inválido: use DDD + número com 10 ou 11 dígitos.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "E-mail inválido.";
  if (state && !/^[A-Z]{2}$/.test(state)) errors.state = "UF inválida: use 2 letras, por exemplo AM.";
  return errors;
}

export function firstBillingProfileError(profile: BillingProfile) {
  const errors = getBillingProfileErrors(profile);
  return errors.documentNumber || errors.postalCode || errors.phone || errors.email || errors.state || "";
}
'''
p = Path('src/billing.ts')
text = p.read_text(encoding='utf-8')
if validators.strip() not in text:
    if insert_after not in text:
        raise SystemExit('Ponto de inserção dos validadores não encontrado em billing.ts')
    p.write_text(text.replace(insert_after, insert_after + validators, 1), encoding='utf-8')

# 4) Financeiro: mensagem antes de chamar o servidor + erros ao lado dos campos.
replace_once(
    'src/finance-ultimate.tsx',
    '''import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, requestProviderRefund, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";''',
    '''import { cancelProviderCharge, emptyBillingProfile, firstBillingProfileError, generateProviderCharge, getBillingProfile, getBillingProfileErrors, requestProviderRefund, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";''',
)
replace_once(
    'src/finance-ultimate.tsx',
    '''  const students = useMemo(() => new Map(database.students.map((item) => [item.id, item])), [database.students]);''',
    '''  const billingErrors = useMemo(() => getBillingProfileErrors(billing), [billing]);\n  const students = useMemo(() => new Map(database.students.map((item) => [item.id, item])), [database.students]);''',
)
replace_once(
    'src/finance-ultimate.tsx',
    '''    setBusy(true);\n    setNotice({ tone: "warning", text: `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"} no provedor. Aguarde a resposta do servidor...` });''',
    '''    const billingError = firstBillingProfileError(billing);\n    if (billingError) {\n      setNotice({ tone: "danger", text: billingError });\n      return;\n    }\n    setBusy(true);\n    setNotice({ tone: "warning", text: `Gerando ${chargeMethod === "pix" ? "Pix" : "boleto"} no provedor. Aguarde a resposta do servidor...` });''',
)

field_replacements = {
    '''<label><span>CPF/CNPJ</span><input value={billing.documentNumber} onChange={(e) => setBilling({...billing, documentNumber:e.target.value})}/></label>''':
    '''<label><span>CPF/CNPJ</span><input inputMode="numeric" maxLength={18} aria-invalid={Boolean(billingErrors.documentNumber)} value={billing.documentNumber} onChange={(e) => setBilling({...billing, documentNumber:e.target.value})}/>{billingErrors.documentNumber && <small className="billing-field-error">{billingErrors.documentNumber}</small>}</label>''',
    '''<label><span>E-mail</span><input type="email" value={billing.email} onChange={(e) => setBilling({...billing, email:e.target.value})}/></label>''':
    '''<label><span>E-mail</span><input type="email" aria-invalid={Boolean(billingErrors.email)} value={billing.email} onChange={(e) => setBilling({...billing, email:e.target.value})}/>{billingErrors.email && <small className="billing-field-error">{billingErrors.email}</small>}</label>''',
    '''<label><span>Telefone</span><input type="tel" inputMode="tel" maxLength={19} value={billing.phone} onChange={(e) => setBilling({...billing, phone:e.target.value})}/></label>''':
    '''<label><span>Telefone</span><input type="tel" inputMode="tel" maxLength={19} aria-invalid={Boolean(billingErrors.phone)} value={billing.phone} onChange={(e) => setBilling({...billing, phone:e.target.value})}/>{billingErrors.phone && <small className="billing-field-error">{billingErrors.phone}</small>}</label>''',
    '''<label><span>CEP</span><input inputMode="numeric" maxLength={9} value={billing.postalCode} onChange={(e) => setBilling({...billing, postalCode:e.target.value})}/></label>''':
    '''<label><span>CEP</span><input inputMode="numeric" maxLength={9} aria-invalid={Boolean(billingErrors.postalCode)} value={billing.postalCode} onChange={(e) => setBilling({...billing, postalCode:e.target.value})}/>{billingErrors.postalCode && <small className="billing-field-error">{billingErrors.postalCode}</small>}</label>''',
    '''<label><span>UF</span><input maxLength={2} value={billing.state} onChange={(e) => setBilling({...billing, state:e.target.value.toUpperCase()})}/></label>''':
    '''<label><span>UF</span><input maxLength={2} aria-invalid={Boolean(billingErrors.state)} value={billing.state} onChange={(e) => setBilling({...billing, state:e.target.value.toUpperCase()})}/>{billingErrors.state && <small className="billing-field-error">{billingErrors.state}</small>}</label>''',
}
for old, new in field_replacements.items():
    replace_once('src/finance-ultimate.tsx', old, new)

# 5) Destaque visual claro no modal.
p = Path('src/finance-ultimate.css')
css = p.read_text(encoding='utf-8')
addition = r'''

/* PAYMENT-DATA-VALIDATION-0.4.15 */
.charge-modal .billing-grid input[aria-invalid="true"] {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 18%, transparent);
}

.charge-modal .billing-field-error {
  display: block;
  margin-top: 5px;
  color: #ef4444;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.3;
}
'''
if 'PAYMENT-DATA-VALIDATION-0.4.15' not in css:
    p.write_text(css.rstrip() + addition + '\n', encoding='utf-8')

print('Hotfix de validação financeira aplicado com sucesso.')
