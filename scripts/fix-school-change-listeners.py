from pathlib import Path

path = Path('src/message-automations-panel.tsx')
text = path.read_text(encoding='utf-8')
original = text

old = 'const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";\n'
new = 'const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";\nconst CLOUD_SCHOOL_CHANGE_EVENT = "aulafacil:cloud-school-change";\n'
if text.count(old) != 1:
    raise SystemExit('constante de instituição não encontrada de forma única')
text = text.replace(old, new, 1)

old_effect = '''  useEffect(() => {\n    const sync = () => {\n      const next = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";\n      setSchoolId(next);\n      void refresh(next).catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar as automações." }));\n    };\n    sync();\n    window.addEventListener("storage", sync);\n    return () => window.removeEventListener("storage", sync);\n  }, []);\n'''
new_effect = '''  useEffect(() => {\n    const sync = () => {\n      const next = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";\n      setSchoolId(next);\n      setCredentialChannelId("");\n      setCredentials({});\n      void refresh(next).catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar as automações." }));\n    };\n    sync();\n    window.addEventListener("storage", sync);\n    window.addEventListener(CLOUD_SCHOOL_CHANGE_EVENT, sync);\n    return () => {\n      window.removeEventListener("storage", sync);\n      window.removeEventListener(CLOUD_SCHOOL_CHANGE_EVENT, sync);\n    };\n  }, []);\n'''
if text.count(old_effect) != 1:
    raise SystemExit('useEffect de sincronização não encontrado de forma única')
text = text.replace(old_effect, new_effect, 1)

if text == original:
    raise SystemExit('nenhuma alteração aplicada')
path.write_text(text, encoding='utf-8')
print('Listeners de troca de instituição corrigidos.')
