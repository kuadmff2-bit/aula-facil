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

const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

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