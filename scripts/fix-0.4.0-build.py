from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


# O App.tsx legado ainda compila junto com o AppNext e precisa receber a instituição
# nos novos painéis de configuração.
app = read("src/App.tsx")
old_finance = '''              <FinanceSettingsPanel
                value={database.settings.finance}
                onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}
              />'''
new_finance = '''              <FinanceSettingsPanel
                value={database.settings.finance}
                institution={database.settings.institution}
                onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}
              />'''
if old_finance in app:
    app = app.replace(old_finance, new_finance, 1)

old_docs = '''              <DocumentSettingsPanel
                receipt={database.settings.receipt}
                certificate={database.settings.certificate}
                onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })}
                onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}
              />'''
new_docs = '''              <DocumentSettingsPanel
                receipt={database.settings.receipt}
                certificate={database.settings.certificate}
                institution={database.settings.institution}
                onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })}
                onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}
              />'''
if old_docs in app:
    app = app.replace(old_docs, new_docs, 1)
write("src/App.tsx", app)

# ExcelJS expõe as margens dentro de pageSetup; pageMargins não existe no tipo Worksheet.
spreadsheet = read("src/spreadsheet-export.ts")
spreadsheet = spreadsheet.replace(
    '  worksheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };',
    '  worksheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };',
)
write("src/spreadsheet-export.ts", spreadsheet)

print("Compatibilidade do build 0.4.0 corrigida.")
