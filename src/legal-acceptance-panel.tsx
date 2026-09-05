import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { acceptCurrentLegalDocuments, getLegalAcceptanceState } from "./legal-acceptance";
import { LEGAL_DOCUMENTS, type LegalDocumentType } from "./legal-documents";
import "./legal-acceptance-panel.css";

type Props = {
  schoolId: string | null;
  onReady: () => void;
};

type Message = { tone: "success" | "danger"; text: string } | null;

export function LegalAcceptancePanel({ schoolId, onReady }: Props) {
  const [selectedType, setSelectedType] = useState<LegalDocumentType>("terms");
  const [checked, setChecked] = useState({ terms: false, privacy: false });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<Message>(null);

  const selected = useMemo(() => LEGAL_DOCUMENTS.find((item) => item.type === selectedType)!, [selectedType]);

  useEffect(() => {
    let active = true;
    setChecking(true);
    void getLegalAcceptanceState(schoolId)
      .then((state) => {
        if (!active) return;
        if (state.ready) onReady();
      })
      .catch((error) => active && setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível verificar o aceite." }))
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [schoolId]);

  const accept = async () => {
    if (!checked.terms || !checked.privacy) {
      setMessage({ tone: "danger", text: "Confirme a leitura dos Termos de Uso e da Política de Privacidade." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await acceptCurrentLegalDocuments(schoolId);
      setMessage({ tone: "success", text: "Aceite registrado com versão, data e hash dos documentos apresentados." });
      onReady();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível registrar o aceite." });
    } finally {
      setBusy(false);
    }
  };

  return <section className="card legal-panel">
    <div className="legal-heading">
      <span><ShieldCheck /></span>
      <div><small>AULAFÁCIL CLOUD</small><h2>Termos e privacidade</h2><p>Antes de usar recursos online, leia os documentos atuais. O aceite fica registrado para auditoria.</p></div>
    </div>

    {checking ? <div className="legal-loading">Verificando aceite...</div> : <>
      <div className="legal-tabs">
        {LEGAL_DOCUMENTS.map((document) => <button key={document.type} className={selectedType === document.type ? "active" : ""} onClick={() => setSelectedType(document.type)}><FileText size={17}/><span>{document.type === "terms" ? "Termos de Uso" : "Privacidade"}</span><small>{document.version}</small></button>)}
      </div>
      <div className="legal-document" tabIndex={0} aria-label={selected.title}>
        <pre>{selected.text}</pre>
      </div>
      <div className="legal-checks">
        <label><input type="checkbox" checked={checked.terms} onChange={(event) => setChecked((current) => ({ ...current, terms: event.target.checked }))}/><span>Li e aceito os Termos de Uso, versão {LEGAL_DOCUMENTS[0].version}.</span></label>
        <label><input type="checkbox" checked={checked.privacy} onChange={(event) => setChecked((current) => ({ ...current, privacy: event.target.checked }))}/><span>Li e aceito a Política de Privacidade, versão {LEGAL_DOCUMENTS[1].version}.</span></label>
      </div>
      {message && <div className={`legal-message ${message.tone}`}>{message.tone === "success" && <CheckCircle2 size={18}/>}<span>{message.text}</span></div>}
      <button className="primary-button" disabled={busy || !checked.terms || !checked.privacy} onClick={() => void accept()}>{busy ? "Registrando..." : "Aceitar e continuar"}</button>
    </>}
  </section>;
}
