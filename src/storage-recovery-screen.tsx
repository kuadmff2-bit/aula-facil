import { useState } from "react";
import { getCloudAuthState, listCloudSchools } from "./cloud";
import { safePullFromCloud } from "./cloud-safe-sync";
import { replaceProtectedDatabase } from "./storage";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

export function StorageRecoveryScreen({ detail }: { detail: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const recoverFromCloud = async () => {
    setBusy(true);
    setFailed(false);
    setMessage("Conferindo sua conta e a instituição na nuvem...");
    try {
      const auth = await getCloudAuthState();
      if (!auth.user) {
        throw new Error("A sessão do AulaFácil Cloud não está disponível neste computador. Entre novamente pela versão corrigida antes de recuperar.");
      }

      const schools = await listCloudSchools();
      if (!schools.length) throw new Error("Sua conta não possui nenhuma instituição disponível para recuperação.");

      const remembered = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      const selected = schools.find((school) => school.id === remembered) ?? (schools.length === 1 ? schools[0] : null);
      if (!selected) {
        throw new Error("Há mais de uma instituição na conta e não foi possível determinar com segurança qual delas recuperar.");
      }

      localStorage.setItem(SELECTED_SCHOOL_KEY, selected.id);
      setMessage(`Baixando os dados de ${selected.name} sem alterar a cópia local original...`);
      const database = await safePullFromCloud(selected.id, "system");
      setMessage("Preservando o arquivo local em quarentena e restaurando a cópia da nuvem...");
      await replaceProtectedDatabase(database);
      setMessage("Recuperação concluída. Reiniciando o AulaFácil...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível recuperar os dados da nuvem.");
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#f3f6fb" }}>
      <section style={{ width: "min(720px, 100%)", padding: 30, borderRadius: 20, background: "white", boxShadow: "0 18px 50px rgba(15, 23, 42, .12)" }}>
        <h1 style={{ marginTop: 0 }}>Os dados foram protegidos</h1>
        <p>O AulaFácil encontrou o armazenamento local, mas recusou abrir uma estrutura que não passou na validação. Nenhum cadastro local foi apagado por esta tela.</p>
        <p style={{ color: "#b42318" }}>{detail}</p>
        <p>A versão corrigida verifica também as cópias protegidas de recuperação. Se nenhuma delas abrir, você pode recuperar a instituição do AulaFácil Cloud; antes de substituir qualquer arquivo, o armazenamento atual é preservado em quarentena.</p>
        {message && <p style={{ color: failed ? "#b42318" : "#1649b8", fontWeight: 700 }}>{message}</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
<button type="button" disabled={busy} onClick={() => void recoverFromCloud()} style={{ minHeight: 44, border: 0, borderRadius: 10, padding: "0 18px", background: "#1649b8", color: "white", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
  {busy ? "Recuperando..." : "Recuperar dados da nuvem"}
</button>
<button type="button" disabled={busy} onClick={() => window.location.reload()} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 18px", background: "white", color: "#0f172a", fontWeight: 750, cursor: "pointer" }}>
  Tentar abrir novamente
</button>
        </div>
      </section>
    </main>
  );
}
