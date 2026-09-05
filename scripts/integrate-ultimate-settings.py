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
    'import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";\n',
    'import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";\n'
    'import { InstitutionSettingsPanel, FinanceSettingsPanel, DocumentSettingsPanel } from "./professional-settings";\n'
    'import { CloudAccountPanel } from "./cloud-account";\n'
    'import { PaymentConnectionsPanel } from "./payment-connections-panel";\n',
    'imports profissionais',
)

replace_once(
    '''function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "paid") return "paid";
  return invoice.dueDate < localDate() ? "overdue" : "pending";
}

function statusText(status: InvoiceStatus) {
  return status === "paid" ? "Pago" : status === "overdue" ? "Atrasado" : "Pendente";
}
''',
    '''function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "paid" || invoice.status === "cancelled") return invoice.status;
  return invoice.dueDate < localDate() ? "overdue" : "pending";
}

function statusText(status: InvoiceStatus) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  return "Pendente";
}
''',
    'status financeiro',
)

replace_once(
    '<span><strong>AulaFácil</strong><small>Centro Shekinah</small></span>',
    '<span><strong>AulaFácil</strong><small>{database.settings.institution.name || "Sua instituição"}</small></span>',
    'marca institucional',
)

replace_once(
    '<div className="local-status"><HardDrive size={18} /><span><strong>Dados locais</strong><small>Salvos neste computador</small></span><CheckCircle2 size={17} /></div>',
    '<div className="local-status"><HardDrive size={18} /><span><strong>Cópia local protegida</strong><small>Criptografada no Windows</small></span><CheckCircle2 size={17} /></div>',
    'status armazenamento',
)

replace_once(
    '<span className="offline-pill"><ShieldCheck size={16} /> Sistema local</span>',
    '<span className="offline-pill"><ShieldCheck size={16} /> Dados protegidos</span>',
    'pill segurança',
)

old_settings = '''          {view === "settings" && (
            <section className="stack">
              <AppearanceSettings
                value={database.settings.appearance}
                onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}
              />
              <StudentFieldsSettings
                fields={database.settings.studentFields}
                onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}
              />
            </section>
          )}
'''
new_settings = '''          {view === "settings" && (
            <section className="stack">
              <InstitutionSettingsPanel
                value={database.settings.institution}
                onChange={(institution) => updateDatabase((draft) => { draft.settings.institution = institution; })}
              />
              <AppearanceSettings
                value={database.settings.appearance}
                onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}
              />
              <StudentFieldsSettings
                fields={database.settings.studentFields}
                onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}
              />
              <FinanceSettingsPanel
                value={database.settings.finance}
                onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}
              />
              <DocumentSettingsPanel
                receipt={database.settings.receipt}
                certificate={database.settings.certificate}
                onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })}
                onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}
              />
              <CloudAccountPanel database={database} onReplaceDatabase={setDatabase} />
              <PaymentConnectionsPanel />
            </section>
          )}
'''
replace_once(old_settings, new_settings, 'painel de configurações')

replace_once(
    '<div className="security-hero card"><span><ShieldCheck size={30} /></span><div><h2>Seus dados ficam neste computador</h2><p>O AulaFácil Desktop não envia cadastros para sites nem exige conta do ChatGPT. Faça backups frequentes para não perder informações se o computador for formatado ou danificado.</p></div></div>',
    '<div className="security-hero card"><span><ShieldCheck size={30} /></span><div><h2>Proteção local + nuvem opcional</h2><p>O AulaFácil mantém uma cópia local protegida no Windows. Quando a instituição ativa o AulaFácil Cloud, os dados autorizados também podem ser sincronizados para recuperação em outros dispositivos. Backups independentes continuam recomendados.</p></div></div>',
    'texto backup',
)

path.write_text(text, encoding='utf-8')
