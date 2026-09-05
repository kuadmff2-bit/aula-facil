from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1, encontrado {count}")
    return text.replace(old, new, 1)

p = Path("src/storage.ts")
t = p.read_text(encoding="utf-8")
t = once(
    t,
    '''  window.alert(\n    "O AulaFácil não conseguiu gravar os dados no armazenamento protegido. "\n    + "Não feche o aplicativo até fazer um backup e verificar o problema.",\n  );''',
    '''  const message = "O AulaFácil não conseguiu gravar os dados no armazenamento protegido. "\n    + "Não feche o aplicativo até fazer um backup e verificar o problema.";\n  window.dispatchEvent(new CustomEvent("aulafacil:storage-failure", { detail: { message } }));''',
    "storage native alert",
)
p.write_text(t, encoding="utf-8")

p = Path("src/App.tsx")
t = p.read_text(encoding="utf-8")
anchor = '''  useEffect(() => {\n    if (!toast) return;\n    const timeout = window.setTimeout(() => setToast(null), 3200);\n    return () => window.clearTimeout(timeout);\n  }, [toast]);'''
replacement = '''  useEffect(() => {\n    const handleStorageFailure = (event: Event) => {\n      const detail = (event as CustomEvent<{ message?: string }>).detail;\n      setConfirmation({\n        title: "Falha ao salvar os dados",\n        message: detail?.message ?? "O armazenamento protegido não respondeu como esperado.",\n        detail: "Faça um backup antes de fechar o aplicativo. Se o problema continuar, reinicie o AulaFácil e verifique o armazenamento do Windows.",\n        confirmLabel: "Entendi",\n        cancelLabel: "Fechar aviso",\n        tone: "warning",\n        onConfirm: () => undefined,\n      });\n    };\n    window.addEventListener("aulafacil:storage-failure", handleStorageFailure);\n    return () => window.removeEventListener("aulafacil:storage-failure", handleStorageFailure);\n  }, []);\n\n  useEffect(() => {\n    if (!toast) return;\n    const timeout = window.setTimeout(() => setToast(null), 3200);\n    return () => window.clearTimeout(timeout);\n  }, [toast]);'''
t = once(t, anchor, replacement, "App storage failure listener")
p.write_text(t, encoding="utf-8")
