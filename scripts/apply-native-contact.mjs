import fs from "node:fs";

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return text.replace(from, to);
}

function edit(path, mutator) {
  const before = fs.readFileSync(path, "utf8");
  const after = mutator(before);
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`);
  fs.writeFileSync(path, after);
}

edit("src-tauri/src/lib.rs", (source) => {
  let text = source;
  text = replaceOnce(text,
`#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {`,
`#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://wa.me/") {
        return Err("O AulaFácil bloqueou a abertura de um endereço externo não permitido.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(&url)
            .spawn()
            .map_err(|error| format!("Não foi possível abrir o WhatsApp no Windows: {error}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("A abertura externa desta versão está disponível somente no Windows.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {`,
    "comando nativo de URL");
  text = replaceOnce(text,
`            secure_auth_save,
            secure_auth_clear
        ])`,
`            secure_auth_save,
            secure_auth_clear,
            open_external_url
        ])`,
    "registro do comando nativo");
  return text;
});

edit("src/student-contact.ts", (source) => {
  let text = source;
  text = replaceOnce(text,
`export function openStudentWhatsApp(database: SchoolDatabase, student: Student, template: StudentContactTemplate = "general", invoice?: Invoice | null) {
  const target = resolveStudentContact(student);
  if (!target) throw new Error(ageGroupFromBirthDate(student.birthDate) === "minor"
    ? "Cadastre um WhatsApp válido do responsável antes de entrar em contato."
    : "Cadastre um WhatsApp válido do aluno antes de entrar em contato.");
  const message = messageForStudentContact(database, student, template, invoice);
  window.open(whatsappUrl(target, message), "_blank", "noopener,noreferrer");
}
`,
`type TauriWindow = Window & { __TAURI_INTERNALS__?: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } };

async function openExternalUrl(url: string) {
  const bridge = (window as TauriWindow).__TAURI_INTERNALS__;
  if (bridge?.invoke) {
    await bridge.invoke<void>("open_external_url", { url });
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function openStudentWhatsApp(database: SchoolDatabase, student: Student, template: StudentContactTemplate = "general", invoice?: Invoice | null) {
  const target = resolveStudentContact(student);
  if (!target) throw new Error(ageGroupFromBirthDate(student.birthDate) === "minor"
    ? "Cadastre um WhatsApp válido do responsável antes de entrar em contato."
    : "Cadastre um WhatsApp válido do aluno antes de entrar em contato.");
  const message = messageForStudentContact(database, student, template, invoice);
  await openExternalUrl(whatsappUrl(target, message));
}
`,
    "abertura externa do WhatsApp");
  return text;
});

edit("src/student-details-panel.tsx", (source) => {
  return replaceOnce(source,
`  const contact = (kind: "general" | "pending" | "overdue", invoice?: Invoice | null) => {
    try { openStudentWhatsApp(database, student, kind, invoice); }
    catch (error) { window.dispatchEvent(new CustomEvent("aulafacil:contact-error", { detail: { message: error instanceof Error ? error.message : "Contato indisponível." } })); }
  };`,
`  const contact = (kind: "general" | "pending" | "overdue", invoice?: Invoice | null) => {
    void openStudentWhatsApp(database, student, kind, invoice).catch((error) => {
      window.dispatchEvent(new CustomEvent("aulafacil:contact-error", { detail: { message: error instanceof Error ? error.message : "Contato indisponível." } }));
    });
  };`,
    "tratamento assíncrono do WhatsApp");
});

console.log("Abertura nativa do WhatsApp preparada.");
