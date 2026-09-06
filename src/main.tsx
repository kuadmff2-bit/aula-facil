import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./AppNext";
import { initializeSecureStorage } from "./storage";
import { installGlobalInputGuards } from "./input-guards";
import { installDesktopInteractions } from "./desktop-interactions";
import { installDocumentPrintIsolation } from "./print-export";
import "./styles.css";
import "./theme.css";
import "./layout-safety.css";
import "./desktop-interactions.css";
import "./print-document-fixes.css";
import "./contrast-fixes.css";
import "./ux-0.4.css";
import "./responsive-hardening.css";
import "./vertical-scroll-hardening.css";
import "./student-fields-compact.css";
// Última camada visual: impede que regras anteriores reabram overflow ou cortem texto.
import "./text-layout-hardening.css";

const root = createRoot(document.getElementById("root")!);

installGlobalInputGuards();
installDesktopInteractions();
installDocumentPrintIsolation();

async function start() {
  try {
    await initializeSecureStorage();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error("Falha ao abrir o armazenamento protegido", error);
    const detail = error instanceof Error ? error.message : "Erro desconhecido";
    root.render(
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#f3f6fb" }}>
        <section style={{ maxWidth: 640, padding: 28, borderRadius: 20, background: "white", boxShadow: "0 18px 50px rgba(15, 23, 42, .12)" }}>
          <h1 style={{ marginTop: 0 }}>Os dados foram protegidos</h1>
          <p>
            O AulaFácil não conseguiu abrir o armazenamento seguro e, por precaução, não iniciou com um banco vazio.
            Isso evita sobrescrever cadastros existentes.
          </p>
          <p style={{ color: "#b42318" }}>{detail}</p>
          <p>Feche o aplicativo e tente novamente. Se o problema continuar, preserve seus backups e procure suporte antes de limpar qualquer dado.</p>
        </section>
      </main>,
    );
  }
}

void start();
