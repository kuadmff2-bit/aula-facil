import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

const failures = [];
const warnings = [];

const pkg = json("package.json");
const tauri = json("src-tauri/tauri.conf.json");
const lock = json("package-lock.json");
const cargo = read("src-tauri/Cargo.toml");
const mainRs = read("src-tauri/src/main.rs");
const terms = read("TERMS_OF_USE.md");
const privacy = read("PRIVACY.md");

const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!pkg.version) failures.push("package.json não possui versão.");
if (tauri.version !== pkg.version) failures.push(`Versões diferentes: package.json=${pkg.version}, tauri.conf.json=${tauri.version}.`);
if (cargoVersion !== pkg.version) failures.push(`Versões diferentes: package.json=${pkg.version}, Cargo.toml=${cargoVersion ?? "ausente"}.`);

if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) {
  failures.push(`package-lock.json registra ${lock.version}/${lock.packages?.[""]?.version}, mas a versão do aplicativo é ${pkg.version}.`);
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
}

if (!terms.includes("Termos de Uso do AulaFácil")) failures.push("TERMS_OF_USE.md não parece válido.");
if (!privacy.includes("Política de privacidade")) failures.push("PRIVACY.md não parece válido.");

const appSource = read("src/App.tsx");
const nativeConfirmCount = (appSource.match(/window\.confirm\s*\(/g) ?? []).length;
if (nativeConfirmCount > 0) {
  warnings.push(`${nativeConfirmCount} confirmação(ões) nativa(s) ainda existem no App.tsx; substituir pelo diálogo visual antes da versão profissional.`);
}

const nativeAlertCount = (appSource.match(/window\.alert\s*\(/g) ?? []).length + (read("src/storage.ts").match(/window\.alert\s*\(/g) ?? []).length;
if (nativeAlertCount > 0) {
  warnings.push(`${nativeAlertCount} alerta(s) nativo(s) ainda existe(m); manter apenas se for mecanismo de emergência.`);
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);

if (failures.length) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}

console.log("✓ Verificações estruturais concluídas.");
