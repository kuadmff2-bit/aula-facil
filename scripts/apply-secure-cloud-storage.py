from pathlib import Path

path = Path("src/cloud.ts")
text = path.read_text(encoding="utf-8")

old_import = 'import { createClient, type Session, type User } from "@supabase/supabase-js";\n'
new_import = old_import + 'import { secureAuthStorage } from "./secure-auth-storage";\n'
if text.count(old_import) != 1:
    raise RuntimeError("Import esperado do Supabase não encontrado exatamente uma vez")
text = text.replace(old_import, new_import, 1)

old_auth = '''  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },'''
new_auth = '''  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: secureAuthStorage,
  },'''
if text.count(old_auth) != 1:
    raise RuntimeError("Bloco de autenticação esperado não encontrado exatamente uma vez")
text = text.replace(old_auth, new_auth, 1)

path.write_text(text, encoding="utf-8")
print("Sessão Supabase configurada para armazenamento protegido.")
