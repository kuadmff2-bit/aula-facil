from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace_once(path: str, old: str, new: str):
    p = root / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Trecho não encontrado em {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Campos gerais / caixas de informação.
replace_once('src/styles.css',
'''.info-box { min-width: 0; padding: 13px; border-radius: 12px; background: #f4f6f9; }''',
'''.info-box { min-width: 0; padding: 14px 15px; border: 1.5px solid #c7d2e2; border-radius: 12px; background: #f8fafc; box-shadow: inset 0 0 0 1px rgba(255,255,255,.72), 0 1px 2px rgba(25,45,78,.035); }''')

replace_once('src/styles.css',
'''.info-box small { color: #8490a2; font-size: 12px; }\n.info-box strong { margin-top: 6px; color: #34435a; font-size: 12px; white-space: nowrap; }''',
'''.info-box small { color: #66758b; font-size: 11px; font-weight: 800; letter-spacing: .01em; }\n.info-box strong { margin-top: 6px; color: #22324a; font-size: 13px; font-weight: 750; white-space: nowrap; }''')

# Configurações profissionais.
replace_once('src/professional-settings.css',
'''.settings-form-grid input, .settings-form-grid select, .settings-form-grid textarea { width: 100%; min-height: 42px; padding: 9px 11px; color: var(--text); border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }''',
'''.settings-form-grid input, .settings-form-grid select, .settings-form-grid textarea { width: 100%; min-height: 44px; padding: 10px 12px; color: var(--text); border: 1.5px solid #b9c7da; border-radius: 11px; background: var(--surface); box-shadow: inset 0 1px 2px rgba(20,42,77,.025); transition: border-color .16s ease, box-shadow .16s ease, background .16s ease; }\n.settings-form-grid input:hover, .settings-form-grid select:hover, .settings-form-grid textarea:hover { border-color: #8fa6c7; }\n.settings-form-grid input:focus, .settings-form-grid select:focus, .settings-form-grid textarea:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(22,73,184,.12); outline: none; }\n.settings-form-grid input:disabled { color: #59677c; border-color: #cbd5e1; background: #f3f6fa; opacity: 1; }''')

# Conta / nuvem.
replace_once('src/cloud-account.css',
'''.cloud-auth-form input, .cloud-create-row input, .cloud-school-selector select { min-height: 43px; width: 100%; padding: 9px 11px; color: var(--text); border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }''',
'''.cloud-auth-form input, .cloud-create-row input, .cloud-school-selector select { min-height: 44px; width: 100%; padding: 10px 12px; color: var(--text); border: 1.5px solid #b9c7da; border-radius: 11px; background: var(--surface); box-shadow: inset 0 1px 2px rgba(20,42,77,.025); transition: border-color .16s ease, box-shadow .16s ease; }\n.cloud-auth-form input:hover, .cloud-create-row input:hover, .cloud-school-selector select:hover { border-color: #8fa6c7; }\n.cloud-auth-form input:focus, .cloud-create-row input:focus, .cloud-school-selector select:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(22,73,184,.12); outline: none; }''')

# Resumos informativos da conta.
replace_once('src/cloud-account.css',
'''.cloud-summary-grid > div { min-height: 88px; display: grid; align-content: center; gap: 4px; padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--canvas); }''',
'''.cloud-summary-grid > div { min-height: 88px; display: grid; align-content: center; gap: 4px; padding: 14px; border: 1.5px solid #c4d0e0; border-radius: 14px; background: #f8fafc; box-shadow: 0 1px 2px rgba(25,45,78,.035); }''')

print('Contraste e contornos dos campos melhorados.')
