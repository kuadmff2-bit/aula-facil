import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const strictRelease = process.env.AULAFACIL_STRICT_RELEASE === "1";

const failures = [];
const warnings = [];

function report(message, releaseBlocker = false) {
  if (strictRelease && releaseBlocker) failures.push(message);
  else warnings.push(message);
}

const pkg = json("package.json");
const tauri = json("src-tauri/tauri.conf.json");
const lock = json("package-lock.json");
const cargo = read("src-tauri/Cargo.toml");
const mainRs = read("src-tauri/src/main.rs");
const terms = read("TERMS_OF_USE.md");
const privacy = read("PRIVACY.md");
const embeddedLegal = read("src/legal-documents.ts");
const storeWorkflow = read(".github/workflows/build-store-msix.yml");
const mainEntry = read("src/main.tsx");
const layoutSafety = exists("src/layout-safety.css") ? read("src/layout-safety.css") : "";
const textLayoutSafety = exists("src/text-layout-hardening.css") ? read("src/text-layout-hardening.css") : "";
const cloudAccountSource = read("src/cloud-account.tsx");
const cloudSyncSource = read("src/cloud-sync-panel.tsx");
const storageSource = read("src/storage.ts");
const recoverySource = read("src/storage-recovery-screen.tsx");
const appNextSource = read("src/AppNext.tsx");

const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (cloudAccountSource.includes("safePullFromCloud") || cloudAccountSource.includes("safePushToCloud")) failures.push("Conta e instituição voltou a duplicar ações de sincronização perigosas.");
if (!cloudSyncSource.includes("No uso normal, é simples")) failures.push("O painel Cloud perdeu a orientação simples de sincronização.");
if (!storageSource.includes("aulafacil:storage-state") || !storageSource.includes("getLocalStorageState")) failures.push("A interface não consegue mais mostrar o estado real do salvamento local.");
if (!recoverySource.includes("signInCloud") || !recoverySource.includes("selectedSchoolId")) failures.push("A tela de recuperação voltou a ter beco sem saída para login ou múltiplas instituições.");
if (!exists("src/data-safety-panel.tsx") || !exists("src/data-safety-panel.css")) failures.push("O resumo didático de computador, nuvem e backup está ausente.");
if (!appNextSource.includes('import packageInfo from "../package.json"') || appNextSource.includes("v0.4.4")) failures.push("A versão exibida no aplicativo pode ficar desatualizada novamente.");

if (!pkg.version) failures.push("package.json não possui versão.");
if (tauri.version !== pkg.version) failures.push(`Versões diferentes: package.json=${pkg.version}, tauri.conf.json=${tauri.version}.`);
if (cargoVersion !== pkg.version) failures.push(`Versões diferentes: package.json=${pkg.version}, Cargo.toml=${cargoVersion ?? "ausente"}.`);

if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  report(`package-lock.json ainda registra ${lock.version}/${lock.packages?.[""]?.version}; sincronizar antes do próximo lançamento.`, true);
}

if (!mainRs.includes('windows_subsystem = "windows"')) {
  failures.push("main.rs não contém a diretiva que impede a abertura do terminal no build de produção.");
}

if (tauri.app?.windows?.some((window) => window.devtools === true)) {
  failures.push("DevTools está habilitado em uma janela de produção.");
}

const csp = tauri.app?.security?.csp;
if (typeof csp !== "string" || !csp.includes("default-src 'self'")) {
  failures.push("A Content Security Policy do Tauri está ausente ou permissiva demais.");
} else {
  if (!csp.includes("connect-src 'self' https://fkafrirbitwlsbjpqtcf.supabase.co")) {
    failures.push("A CSP não permite explicitamente a conexão HTTPS com o AulaFácil Cloud.");
  }
  if (!csp.includes("wss://fkafrirbitwlsbjpqtcf.supabase.co")) {
    failures.push("A CSP não permite a conexão WebSocket segura com o AulaFácil Cloud.");
  }
  if (csp.includes("default-src *") || csp.includes("connect-src *")) {
    failures.push("A CSP contém wildcard amplo em uma diretiva crítica.");
  }
}

if (!terms.includes("Termos de Uso do AulaFácil")) failures.push("TERMS_OF_USE.md não parece válido.");
if (!privacy.includes("Política de privacidade")) failures.push("PRIVACY.md não parece válido.");
if (embeddedLegal.includes("0.3.0-draft") || embeddedLegal.toLocaleLowerCase("pt-BR").includes("rascunho técnico-operacional")) {
  report("Os documentos jurídicos exibidos no aplicativo ainda estão marcados como rascunho.", true);
}
if (!embeddedLegal.includes('version: "1.0"') || !embeddedLegal.includes('version: "0.3.0"')) {
  report("As versões dos documentos jurídicos embutidos não correspondem aos documentos estáveis esperados.", true);
}
if (exists("PRIVACY_CLOUD.md") || exists("TERMS_CLOUD.md")) {
  report("Ainda existem documentos jurídicos Cloud antigos/duplicados que podem causar divergência de versão.", true);
}

if (!mainEntry.includes('import "./layout-safety.css"')) {
  failures.push("A proteção global contra overflow horizontal não está carregada no entrypoint.");
}
if (!layoutSafety) {
  failures.push("src/layout-safety.css não foi encontrado.");
} else {
  if (!/overflow-x\s*:\s*hidden/.test(layoutSafety) || !/overscroll-behavior-x\s*:\s*none/.test(layoutSafety)) {
    failures.push("A proteção global não bloqueia deslocamento horizontal da janela.");
  }
  if (!/min-width\s*:\s*0\s*!important/.test(layoutSafety)) {
    failures.push("A proteção global não neutraliza larguras mínimas fixas do documento.");
  }
  if (!/\.table-card[\s\S]*?overflow-x\s*:\s*auto/.test(layoutSafety)) {
    failures.push("Tabelas largas não possuem rolagem horizontal isolada dentro do próprio card.");
  }
}

if (!mainEntry.includes('import "./text-layout-hardening.css"')) {
  failures.push("A proteção final contra texto cortado/estourado não está carregada no entrypoint.");
}
const finalLayoutImport = mainEntry.lastIndexOf('import "./text-layout-hardening.css"');
const lastCssImport = Math.max(
  mainEntry.lastIndexOf('import "./student-fields-compact.css"'),
  mainEntry.lastIndexOf('import "./vertical-scroll-hardening.css"'),
  mainEntry.lastIndexOf('import "./responsive-hardening.css"'),
);
if (finalLayoutImport >= 0 && finalLayoutImport < lastCssImport) {
  failures.push("text-layout-hardening.css precisa ser a última proteção visual importada.");
}
if (!textLayoutSafety) {
  failures.push("src/text-layout-hardening.css não foi encontrado.");
} else {
  if (!/overflow-x\s*:\s*clip\s*!important/.test(textLayoutSafety)) {
    failures.push("A proteção final não bloqueia overflow horizontal da janela.");
  }
  if (!/overflow-wrap\s*:\s*anywhere/.test(textLayoutSafety)) {
    failures.push("A proteção final não garante quebra de textos longos.");
  }
  if (!/\.cloud-sync-card[\s\S]*?padding\s*:/.test(textLayoutSafety)) {
    failures.push("Cards de sincronização podem voltar a ficar sem respiro interno.");
  }
  if (!/@container\s+aulafacil-content/.test(textLayoutSafety)) {
    failures.push("A proteção final não usa a largura real da área de conteúdo.");
  }
  if (!/\.table-card[\s\S]*?overflow-x\s*:\s*auto\s*!important/.test(textLayoutSafety)) {
    failures.push("A proteção final não preserva a rolagem horizontal interna das tabelas.");
  }
}

const appSource = read("src/App.tsx");
const nativeConfirmCount = (appSource.match(/window\.confirm\s*\(/g) ?? []).length;
if (nativeConfirmCount > 0) {
  report(`${nativeConfirmCount} confirmação(ões) nativa(s) ainda existem no App.tsx; substituir pelo diálogo visual antes da versão profissional.`, true);
}

const nativeAlertCount = (appSource.match(/window\.alert\s*\(/g) ?? []).length
  + (read("src/storage.ts").match(/window\.alert\s*\(/g) ?? []).length;
if (nativeAlertCount > 0) {
  report(`${nativeAlertCount} alerta(s) nativo(s) ainda existe(m); manter apenas se for mecanismo de emergência.`, false);
}

if (strictRelease) {
  if (pkg.version.startsWith("0.3.")) {
    if (!privacy.includes("Versão:** 0.3.0") || !privacy.includes("AulaFácil Cloud 0.3.x")) {
      failures.push("A Política de Privacidade não está identificada como documento da linha 0.3.x.");
    }
    if (!terms.includes("Versão:** 1.0")) {
      failures.push("Os Termos de Uso não estão identificados como versão 1.0.");
    }
  }

  const requiredStoreValues = [
    "CarlosOlmpioCruzdeSouza.AulaFcil",
    "CN=882E7707-B009-419E-BD3B-FB6BC310FDA4",
    "Carlos Olímpio Cruz de Souza",
  ];
  for (const expected of requiredStoreValues) {
    if (!storeWorkflow.includes(expected)) failures.push(`O workflow da Microsoft Store não contém o valor obrigatório: ${expected}`);
  }

  if (!read("src/portable-backup.ts").includes('cipher: "AES-256-GCM"')) {
    failures.push("O backup portátil não declara AES-256-GCM.");
  }
  if (!read("src-tauri/src/lib.rs").includes("CryptProtectData")) {
    failures.push("O armazenamento local protegido do Windows não foi encontrado.");
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}

console.log(`✓ Verificações estruturais concluídas${strictRelease ? " em modo estrito de release" : ""}.`);