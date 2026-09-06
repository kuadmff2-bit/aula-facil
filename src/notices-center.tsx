import { CheckCircle2, Clock3, Megaphone, Plus, Send, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cloud } from "./cloud";
import { listMessageChannels, listRecentOutbox, type MessageChannel, type OutboxItem } from "./message-automations";
import { makeId, type SchoolDatabase } from "./model";

type Props = {
  database: SchoolDatabase;
  onChange: (database: SchoolDatabase) => void;
  notify: (message: string, tone?: "success" | "warning" | "danger") => void;
};

type Audience = "all" | "students" | "guardians" | "class" | "selected";

function audienceLabel(value: Audience, className = "") {
  if (value === "students") return "Alunos";
  if (value === "guardians") return "Responsáveis";
  if (value === "class") return className ? `Turma: ${className}` : "Turma";
  if (value === "selected") return "Alunos selecionados";
  return "Todos";
}

function statusIcon(status: OutboxItem["status"]) {
  if (status === "sent") return <CheckCircle2 size={15}/>;
  if (status === "failed") return <XCircle size={15}/>;
  return <Clock3 size={15}/>;
}

export function NoticesCenter({ database, onChange, notify }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [classId, setClassId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channelId, setChannelId] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [channels, setChannels] = useState<MessageChannel[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState("");
  const schoolId = localStorage.getItem("aulafacil.cloud.selected-school") ?? "";

  const activeStudents = useMemo(() => database.students.filter((student) => student.active && (student.enrollmentStatus ?? "active") === "active"), [database.students]);
  const readyChannels = channels.filter((channel) => channel.enabled && channel.credentialsConfigured);

  const refreshMessaging = async () => {
    if (!schoolId) {
      setChannels([]);
      setOutbox([]);
      return;
    }
    const [nextChannels, nextOutbox] = await Promise.all([listMessageChannels(schoolId), listRecentOutbox(schoolId, 20)]);
    setChannels(nextChannels);
    setOutbox(nextOutbox);
    setChannelId((current) => nextChannels.some((item) => item.id === current && item.enabled && item.credentialsConfigured)
      ? current
      : nextChannels.find((item) => item.enabled && item.credentialsConfigured)?.id ?? "");
  };

  useEffect(() => {
    void refreshMessaging().catch(() => undefined);
  }, [schoolId]);

  const reset = () => {
    setTitle("");
    setMessage("");
    setAudience("all");
    setClassId("");
    setSelectedIds([]);
    setShowForm(false);
  };

  const save = async () => {
    const cleanTitle = title.trim();
    const cleanMessage = message.trim();
    if (!cleanTitle || !cleanMessage) {
      notify("Escreva o título e a mensagem.", "danger");
      return;
    }
    if (audience === "class" && !classId) {
      notify("Escolha a turma que receberá o comunicado.", "danger");
      return;
    }
    if (audience === "selected" && !selectedIds.length) {
      notify("Selecione pelo menos um aluno.", "danger");
      return;
    }

    setBusy(true);
    try {
      const className = database.classes.find((item) => item.id === classId)?.name ?? "";
      const next = structuredClone(database);
      next.notices.unshift({
        id: makeId("aviso"),
        title: cleanTitle,
        message: cleanMessage,
        audience: audienceLabel(audience, className),
        publishedAt: new Date().toISOString(),
      });
      next.updatedAt = new Date().toISOString();
      onChange(next);

      if (sendNow) {
        if (!schoolId) throw new Error("Aviso salvo no mural. Entre no AulaFácil Cloud para enviar pelo WhatsApp.");
        if (!channelId) throw new Error("Aviso salvo no mural. Conecte um canal de WhatsApp para enviar.");
        const { data, error } = await cloud.functions.invoke("message-broadcast", {
          body: {
            schoolId,
            channelId,
            title: cleanTitle,
            message: cleanMessage,
            audience,
            classId: audience === "class" ? classId : undefined,
            studentIds: audience === "selected" ? selectedIds : undefined,
            recipientMode: audience === "guardians" ? "guardian" : audience === "students" ? "student" : "auto",
          },
        });
        if (error) throw new Error(`Aviso salvo, mas o envio falhou: ${error.message}`);
        if (data?.error) throw new Error(`Aviso salvo, mas o envio falhou: ${String(data.error)}`);
        notify(`Aviso salvo e ${Number(data?.queued ?? 0)} mensagem(ns) colocada(s) para envio.${Number(data?.skipped ?? 0) ? ` ${Number(data.skipped)} contato(s) sem telefone válido.` : ""}`);
        await refreshMessaging();
      } else {
        notify("Aviso salvo no mural.");
      }
      reset();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível concluir o comunicado.", "warning");
      reset();
    } finally {
      setBusy(false);
    }
  };

  const removeNotice = (id: string) => {
    if (deleteArmed !== id) {
      setDeleteArmed(id);
      return;
    }
    const next = structuredClone(database);
    next.notices = next.notices.filter((item) => item.id !== id);
    next.updatedAt = new Date().toISOString();
    onChange(next);
    setDeleteArmed("");
    notify("Aviso removido do mural.", "warning");
  };

  return (
    <section className="stack notices-center">
      <div className="page-heading">
        <div><h2>Central de comunicados</h2><p>Salve no mural ou envie pelo WhatsApp.</p></div>
        <button className="primary-button" onClick={() => setShowForm((current) => !current)}><Plus size={18}/>{showForm ? "Fechar" : "Novo comunicado"}</button>
      </div>

      {showForm && <div className="card notice-compose">
        <div className="notice-compose-grid">
          <label className="wide"><span>Título</span><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Recesso escolar" /></label>
          <label><span>Público</span><select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}><option value="all">Todos, conforme idade</option><option value="students">Somente alunos</option><option value="guardians">Somente responsáveis</option><option value="class">Uma turma</option><option value="selected">Alunos selecionados</option></select></label>
          {audience === "class" && <label><span>Turma</span><select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Escolha</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select></label>}
          <label className="wide"><span>Mensagem</span><textarea rows={5} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Digite o comunicado" /></label>
          {audience === "selected" && <div className="notice-student-picker wide"><strong>Quem receberá</strong>{activeStudents.map((student) => <label key={student.id}><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))}/><span>{student.name}</span></label>)}</div>}
          <label><span>Canal de envio</span><select value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={!readyChannels.length}><option value="">{readyChannels.length ? "Escolha" : "Nenhum canal conectado"}</option>{readyChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.providerKey === "meta" ? "Meta" : "Robô AulaFácil"}</option>)}</select></label>
          <label className="notice-send-toggle"><input type="checkbox" checked={sendNow} onChange={(event) => setSendNow(event.target.checked)}/><span>Enviar pelo WhatsApp agora</span></label>
        </div>
        <div className="form-actions"><button className="secondary-button" type="button" onClick={reset}>Cancelar</button><button className="primary-button" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : sendNow ? <><Send size={17}/> Salvar e enviar</> : "Salvar no mural"}</button></div>
      </div>}

      {database.notices.length ? <div className="notice-grid">{database.notices.map((notice) => <article className="card notice-card" key={notice.id}><div><span className="audience">{notice.audience}</span><time>{new Date(notice.publishedAt).toLocaleDateString("pt-BR")}</time></div><h3>{notice.title}</h3><p>{notice.message}</p><button className="quiet-danger" onClick={() => removeNotice(notice.id)}><Trash2 size={16}/>{deleteArmed === notice.id ? "Confirmar exclusão" : "Excluir"}</button></article>)}</div> : <div className="card empty-state"><span><Megaphone/></span><h2>Nenhum aviso</h2><p>Crie o primeiro comunicado quando precisar falar com alunos ou responsáveis.</p></div>}

      {outbox.length > 0 && <div className="card notice-history"><div className="section-heading"><div><h2>Envios recentes</h2><p>Últimas mensagens processadas pelos canais da escola.</p></div></div><div className="notice-history-list">{outbox.slice(0, 12).map((item) => <div key={item.id} className={`notice-history-item ${item.status}`}>{statusIcon(item.status)}<span><strong>{item.recipientPhone}</strong><small>{item.messageBody.slice(0, 90)}{item.messageBody.length > 90 ? "…" : ""}</small></span><b>{item.status === "sent" ? "Enviada" : item.status === "failed" ? "Falhou" : "Pendente"}</b></div>)}</div></div>}
    </section>
  );
}
