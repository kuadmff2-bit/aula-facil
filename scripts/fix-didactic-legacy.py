from pathlib import Path

path = Path("src/App.tsx")
text = path.read_text(encoding="utf-8")
old = '  notices: { title: "Avisos", description: "Organize comunicados para alunos e responsáveis." },\n  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },'
new = '  notices: { title: "Avisos", description: "Organize comunicados para alunos e responsáveis." },\n  automations: { title: "Automações", description: "Configure mensagens automáticas." },\n  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },'
if old not in text:
    raise SystemExit("viewCopy legado não encontrado")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("App legado compatível com Automações.")
