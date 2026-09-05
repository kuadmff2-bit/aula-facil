import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HandCoins, X } from "lucide-react";
import { getCloudSyncStatus } from "./cloud-safe-sync";
import { invoiceAmountDue } from "./finance-utils";
import {
  cancelDebtNegotiation,
  createDebtNegotiation,
  listDebtNegotiations,
  listNegotiationInstallments,
  type DebtNegotiation,
  type NegotiationInstallment,
} from "./debt-negotiation";
import type { Invoice, SchoolDatabase } from "./model";
import "./debt-negotiation-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

type Props = { database: SchoolDatabase };
type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function dateLabel(value: string) {
  return value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}
function today() { return new Date().toISOString().slice(0,10); }
function isOverdue(invoice: Invoice) { return invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "negotiated" && invoice.dueDate < today(); }

export function DebtNegotiationPanel({ database }: Props) {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [agreements, setAgreements] = useState<DebtNegotiation[]>([]);
  const [expanded, setExpanded] = useState<Record<string, NegotiationInstallment[]>>({});
  const [studentId, setStudentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<"fixed"|"percent">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const studentMap = useMemo(() => new Map(database.students.map((s) => [s.id,s])), [database.students]);
  const overdueByStudent = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const invoice of database.invoices.filter(isOverdue)) {
      const list = map.get(invoice.studentId) ?? [];
      list.push(invoice); map.set(invoice.studentId,list);
    }
    return map;
  }, [database.invoices]);
  const eligibleStudents = useMemo(() => database.students.filter((s) => (overdueByStudent.get(s.id)?.length ?? 0) > 0), [database.students, overdueByStudent]);
  const invoices = studentId ? overdueByStudent.get(studentId) ?? [] : [];

  const preview = useMemo(() => {
    let original=0, late=0;
    for (const invoice of invoices.filter((i) => selected.includes(i.id))) {
      const b = invoiceAmountDue(invoice,database.settings.finance);
      original += b.baseAmount; late += b.lateFee+b.interest;
    }
    const gross = Math.round((original+late)*100)/100;
    const discount = discountType === "percent" ? gross*Math.min(100,Math.max(0,discountValue))/100 : Math.min(gross,Math.max(0,discountValue));
    const total = Math.max(0,Math.round((gross-discount)*100)/100);
    const remaining = Math.max(0,Math.round((total-Math.max(0,downPayment))*100)/100);
    return { original, late, gross, discount, total, remaining, installment: installmentCount>0 ? Math.round(remaining/installmentCount*100)/100 : 0 };
  }, [invoices,selected,database.settings.finance,discountType,discountValue,downPayment,installmentCount]);

  const refresh = async (target=schoolId) => {
    if (!target) { setAgreements([]); return; }
    setAgreements(await listDebtNegotiations(target));
  };

  useEffect(() => {
    const next=localStorage.getItem(SELECTED_SCHOOL_KEY)??"";
    setSchoolId(next);
    void refresh(next).catch((error)=>setMessage({tone:"danger",text:error instanceof Error?error.message:"Não foi possível carregar os acordos."}));
  }, []);

  const run = async (op:()=>Promise<void>) => { setBusy(true); setMessage(null); try{await op();}catch(error){setMessage({tone:"danger",text:error instanceof Error?error.message:"A operação falhou."});}finally{setBusy(false);} };

  const create = () => void run(async()=>{
    if(!schoolId) throw new Error("Selecione a instituição no AulaFácil Cloud.");
    if(!studentId || selected.length===0) throw new Error("Selecione o aluno e ao menos uma mensalidade atrasada.");
    const syncStatus=await getCloudSyncStatus(schoolId,database);
    if(syncStatus!=="synced") throw new Error("Sincronize este computador antes de criar a negociação. Isso evita usar valores antigos da nuvem.");
    if(preview.remaining<=0) throw new Error("A entrada deve ser menor que o valor final negociado.");
    await createDebtNegotiation({schoolId,studentId,invoiceIds:selected,discountType,discountValue,downPayment,installmentCount,firstDueDate,notes});
    setSelected([]); setDiscountValue(0); setDownPayment(0); setNotes("");
    await refresh();
    setMessage({tone:"success",text:"Acordo criado. As mensalidades originais foram preservadas e marcadas como renegociadas no servidor."});
  });

  const toggleAgreement = (agreement:DebtNegotiation) => void run(async()=>{
    if(expanded[agreement.id]) { setExpanded((v)=>{const n={...v};delete n[agreement.id];return n;}); return; }
    const installments=await listNegotiationInstallments(schoolId,agreement.id);
    setExpanded((v)=>({...v,[agreement.id]:installments}));
  });

  return <section className="card debt-panel">
    <div className="debt-heading"><div><span>NEGOCIAÇÃO</span><h2>Acordos de mensalidades atrasadas</h2><p>Selecione dívidas, conceda desconto e parcele sem apagar o histórico original.</p></div><HandCoins/></div>
    {!schoolId && <div className="debt-message warning">Conecte e selecione a instituição no AulaFácil Cloud para formalizar acordos.</div>}
    {message && <div className={`debt-message ${message.tone}`}><span>{message.text}</span><button onClick={()=>setMessage(null)}><X size={15}/></button></div>}

    <div className="debt-builder">
      <h3>Novo acordo</h3>
      <div className="debt-form-grid">
        <label><span>Aluno inadimplente</span><select value={studentId} onChange={(e)=>{setStudentId(e.target.value);setSelected([]);}}><option value="">Escolha o aluno</option>{eligibleStudents.map((s)=><option key={s.id} value={s.id}>{s.name} · {overdueByStudent.get(s.id)?.length} pendência(s)</option>)}</select></label>
        <label><span>Primeiro vencimento</span><input type="date" value={firstDueDate} onChange={(e)=>setFirstDueDate(e.target.value)}/></label>
      </div>
      {studentId && <div className="debt-invoices">{invoices.map((invoice)=>{const b=invoiceAmountDue(invoice,database.settings.finance);return <label key={invoice.id}><input type="checkbox" checked={selected.includes(invoice.id)} onChange={(e)=>setSelected((v)=>e.target.checked?[...v,invoice.id]:v.filter((id)=>id!==invoice.id))}/><div><strong>{invoice.reference}</strong><span>Venceu {dateLabel(invoice.dueDate)} · Base {money(invoice.amount)}</span></div><b>{money(b.totalDue)}</b></label>;})}</div>}
      <div className="debt-form-grid">
        <label><span>Desconto</span><div className="debt-combo"><select value={discountType} onChange={(e)=>setDiscountType(e.target.value as "fixed"|"percent")}><option value="fixed">R$</option><option value="percent">%</option></select><input type="number" min={0} step="0.01" value={discountValue} onChange={(e)=>setDiscountValue(Math.max(0,Number(e.target.value)||0))}/></div></label>
        <label><span>Entrada</span><input type="number" min={0} step="0.01" value={downPayment} onChange={(e)=>setDownPayment(Math.max(0,Number(e.target.value)||0))}/></label>
        <label><span>Parcelas</span><input type="number" min={1} max={120} value={installmentCount} onChange={(e)=>setInstallmentCount(Math.max(1,Math.min(120,Math.trunc(Number(e.target.value)||1))))}/></label>
        <label><span>Observações</span><input maxLength={500} value={notes} onChange={(e)=>setNotes(e.target.value)}/></label>
      </div>
      <div className="debt-preview"><div><span>Dívida original</span><b>{money(preview.original)}</b></div><div><span>Multa + juros</span><b>{money(preview.late)}</b></div><div><span>Desconto</span><b>- {money(preview.discount)}</b></div><div><span>Total do acordo</span><strong>{money(preview.total)}</strong></div><div><span>Entrada</span><b>{money(downPayment)}</b></div><div><span>Saldo / parcelas</span><strong>{money(preview.remaining)} · aprox. {installmentCount}x {money(preview.installment)}</strong></div></div>
      <button className="primary-button" disabled={busy||!schoolId||selected.length===0} onClick={create}>{busy?"Processando...":"Criar acordo"}</button>
    </div>

    <div className="debt-existing"><h3>Acordos registrados</h3>{agreements.length?agreements.map((a)=><article key={a.id} className="debt-agreement"><div className="debt-agreement-main"><div><strong>{studentMap.get(a.studentId)?.name??"Aluno"}</strong><span>{a.installmentCount} parcelas · criado {dateLabel(a.createdAt)}</span></div><div><b>{money(a.negotiatedTotal)}</b><span className={`status ${a.status}`}>{a.status==="active"?"Ativo":a.status==="paid"?"Quitado":a.status==="cancelled"?"Cancelado":a.status==="defaulted"?"Inadimplente":"Rascunho"}</span></div></div><div className="debt-agreement-actions"><button onClick={()=>toggleAgreement(a)}>{expanded[a.id]?"Ocultar parcelas":"Ver parcelas"}</button>{a.status==="active"&&<button className="danger" onClick={()=>void run(async()=>{await cancelDebtNegotiation(schoolId,a.id);await refresh();setMessage({tone:"warning",text:"Acordo cancelado. As mensalidades originais voltaram à cobrança normal."});})}>Cancelar acordo</button>}</div>{expanded[a.id]&&<div className="debt-installments">{expanded[a.id].map((p)=><div key={p.id}><span>{p.number}ª parcela · {dateLabel(p.dueDate)}</span><b>{money(p.amount)}</b><em className={`status ${p.status}`}>{p.status==="paid"?"Paga":p.status==="overdue"?"Atrasada":p.status==="cancelled"?"Cancelada":"Pendente"}</em></div>)}</div>}</article>):<div className="debt-empty"><CheckCircle2/><span>Nenhum acordo registrado.</span></div>}</div>
  </section>;
}
