from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src" / "App.tsx"
content = path.read_text(encoding="utf-8")
old = '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },'
new = '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n  cloud: { title: "Conta e nuvem", description: "Login, instituição, sincronização e estado deste dispositivo." },\n  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },'
if old not in content:
    if 'cloud: { title: "Conta e nuvem"' in content:
        raise SystemExit(0)
    raise SystemExit("Trecho viewCopy do App legado não encontrado")
path.write_text(content.replace(old, new, 1), encoding="utf-8")
print("App legado compatível com View.cloud.")
