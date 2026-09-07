import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./AppNext";
import { initializeSecureStorage } from "./storage";
import { StorageRecoveryScreen } from "./storage-recovery-screen";
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
      <StrictMode>
        <StorageRecoveryScreen detail={detail} />
      </StrictMode>,
    );
  }
}

void start();
