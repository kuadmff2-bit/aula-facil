import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, ReceiptText, X } from "lucide-react";
import { getCloudSyncStatus } from "./cloud-safe-sync";
import { invoiceAmountDue } from "./finance-utils";
import {
  cancelDebtNegotiation,
  confirmNegotiationDownPayment,
  confirmNegotiationInstallmentPayment,
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
function money(v:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0)}
function dateLabel(v:string|null|undefined){return v?new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR"):"—"}
function today(){return new Date().toISOString().slice(0,10)}
function isOverdue(i:Invoice){return !["paid","cancelled","negotiated"].includes(i.status)&&i.dueDate<today()}

export function DebtNegotiationPanel({database}:Props){
 const [schoolId,setSchoolId]=useState(()=>localStorage.getItem(SELECTED_SCHOOL_KEY)??"");
 const [agreements,setAgreements]=useState<DebtNegotiation[]>([]),[expanded,setExpanded]=useState<Record<string,NegotiationInstallment[]>>({});
 const [studentId,setStudentId]=useState(""),[selected,setSelected]=useState<string[]>([]),[discountType,setDiscountType]=useState<"fixed"|"percent">("fixed");
 const [discountValue,setDiscountValue]=useState(0),[downPayment,setDownPayment]=useState(0),[installmentCount,setInstallmentCount]=useState(3);
 const [firstDueDate,setFirstDueDate]=useState(today()),[notes,setNotes]=useState(""),[paymentMethod,setPaymentMethod]=useState("dinheiro");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<Message>(null);
 const studentMap=useMemo(()=>new Map(database.students.map(s=>[s.id,s])),[database.students]);
 const overdueByStudent=useMemo(()=>{const m=new Map<string,Invoice[]>();for(const i of database.invoices.filter(isOverdue)){const a=m.get(i.studentId)??[];a.push(i);m.set(i.studentId,a)}return m},[database.invoices]);
 const eligibleStudents=useMemo(()=>database.students.filter(s=>(overdueByStudent.get(s.id)?.length??0)>0),[database.students,overdueByStudent]);
 const invoices=studentId?overdueByStudent.get(studentId)??[]:[];
 const preview=useMemo(()=>{let original=0,late=0;for(const i of invoices.filter(x=>selected.includes(x.id))){const b=invoiceAmountDue(i,database.settings.finance);original+=b.baseAmount;late+=b.lateFee+b.interest}const gross=Math.round((original+late)*100)/100;const discount=discountType==="percent"?gross*Math.min(100,Math.max(0,discountValue))/100:Math.min(gross,Math.max(0,discountValue));const total=Math.max(0,Math.round((gross-discount)*100)/100),remaining=Math.max(0,Math.round((total-Math.max(0,downPayment))*100)/100);return{original,late,discount,total,remaining,installment:installmentCount?Math.round(remaining/installmentCount*100)/100:0}},[invoices,selected,database.settings.finance,discountType,discountValue,downPayment,installmentCount]);
 const refresh=async(target=schoolId)=>{if(!target){setAgreements([]);return}setAgreements(await listDebtNegotiations(target))};
 useEffect(()=>{const id=localStorage.getItem(SELECTED_SCHOOL_KEY)??"";setSchoolId(id);void refresh(id).catch(e=>setMessage({tone:"danger",text:e instanceof Error?e.message:"Não foi possível carregar os acordos."}))},[]);
 const run=async(op:()=>Promise<void>)=>{setBusy(true);setMessage(null);try{await op()}catch(e){setMessage({tone:"danger",text:e instanceof Error?e.message:"A operação falhou."})}finally{setBusy(false)}};
 const create=()=>void run(async()=>{if(!schoolId)throw new Error("Selecione a instituição no AulaFácil Cloud.");if(!studentId||!selected.length)throw new Error("Selecione o aluno e ao menos uma mensalidade atrasada.");if(await getCloudSyncStatus(schoolId,database)!=="synced")throw new Error("Sincronize este computador antes de criar a negociação.");if(preview.remaining<=0)throw new Error("A entrada deve ser menor que o valor final negociado.");await createDebtNegotiation({schoolId,studentId,invoiceIds:selected,discountType,discountValue,downPayment,installmentCount,firstDueDate,notes});setSelected([]);setDiscountValue(0);setDownPayment(0);setNotes("");await refresh();setMessage({tone:"success",text:"Acordo criado e formalizado com histórico preservado."})});
 const toggle= (a:DebtNegotiation)=>void run(async()=>{if(expanded[a.id]){setExpanded(v=>{const n={...v};delete n[a.id];return n})}else setExpanded(v=>({...v,[a.id]:await listNegotiationInstallments(schoolId,a.id)}))});
 const receiveEntry=(a:DebtNegotiation)=>void run(async()=>{const r=await confirmNegotiationDownPayment(schoolId,a.id,paymentMethod);await refresh();setMessage({tone:"success",text:`Entrada recebida. Recibo ${r.receiptNumber??r.id} · ${money(r.amountReceived)}.`})});
 const receiveInstallment=(a:DebtNegotiation,p:NegotiationInstallment)=>void run(async()=>{const r=await confirmNegotiationInstallmentPayment(schoolId,p.id,paymentMethod);const parts=await listNegotiationInstallments(schoolId,a.id);setExpanded(v=>({...v,[a.id]:parts}));await refresh();setMessage({tone:"success",text:`Parcela ${p.number} recebida. Recibo ${r.receiptNumber??r.id} · ${money(r.amountReceived)}.`})});
 return <section className="card debt-panel">
  <div className="debt-heading"><div><span>NEGOCIAÇÃO</span><h2>Acordos de mensalidades atrasadas</h2><p>Desconto, entrada, parcelamento e recibos sem apagar a dívida original.</p></div><HandCoins/></div>
  {!schoolId&&<div className="debt-message warning">Conecte a instituição no AulaFácil Cloud para formalizar acordos.</div>}{message&&<div className={`debt-message ${message.tone}`}><span>{message.text}</span><button onClick={()=>setMessage(null)}><X size={15}/></button></div>}
  <div className="debt-builder"><h3>Novo acordo</h3><div className="debt-form-grid"><label><span>Aluno inadimplente</span><select value={studentId} onChange={e=>{setStudentId(e.target.value);setSelected([])}}><option value="">Escolha</option>{eligibleStudents.map(s=><option key={s.id} value={s.id}>{s.name} · {overdueByStudent.get(s.id)?.length} pendência(s)</option>)}</select></label><label><span>Primeiro vencimento</span><input type="date" value={firstDueDate} onChange={e=>setFirstDueDate(e.target.value)}/></label></div>
  {studentId&&<div className="debt-invoices">{invoices.map(i=>{const b=invoiceAmountDue(i,database.settings.finance);return <label key={i.id}><input type="checkbox" checked={selected.includes(i.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,i.id]:v.filter(id=>id!==i.id))}/><div><strong>{i.reference}</strong><span>Venceu {dateLabel(i.dueDate)} · Base {money(i.amount)}</span></div><b>{money(b.totalDue)}</b></label>})}</div>}
  <div className="debt-form-grid"><label><span>Desconto</span><div className="debt-combo"><select value={discountType} onChange={e=>setDiscountType(e.target.value as "fixed"|"percent")}><option value="fixed">R$</option><option value="percent">%</option></select><input type="number" min={0} step=".01" value={discountValue} onChange={e=>setDiscountValue(Math.max(0,+e.target.value||0))}/></div></label><label><span>Entrada</span><input type="number" min={0} step=".01" value={downPayment} onChange={e=>setDownPayment(Math.max(0,+e.target.value||0))}/></label><label><span>Parcelas</span><input type="number" min={1} max={120} value={installmentCount} onChange={e=>setInstallmentCount(Math.max(1,Math.min(120,Math.trunc(+e.target.value||1))))}/></label><label><span>Observações</span><input maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
  <div className="debt-preview"><div><span>Dívida original</span><b>{money(preview.original)}</b></div><div><span>Multa + juros</span><b>{money(preview.late)}</b></div><div><span>Desconto</span><b>- {money(preview.discount)}</b></div><div><span>Total</span><strong>{money(preview.total)}</strong></div><div><span>Entrada</span><b>{money(downPayment)}</b></div><div><span>Saldo / parcelas</span><strong>{money(preview.remaining)} · aprox. {installmentCount}x {money(preview.installment)}</strong></div></div><button className="primary-button" disabled={busy||!schoolId||!selected.length} onClick={create}>{busy?"Processando...":"Criar acordo"}</button></div>
  <div className="debt-existing"><div className="debt-list-head"><h3>Acordos registrados</h3><label><span>Forma de recebimento</span><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="dinheiro">Dinheiro</option><option value="pix_manual">Pix</option><option value="transferencia">Transferência</option><option value="cartao">Cartão/maquininha</option><option value="outro">Outro</option></select></label></div>{agreements.length?agreements.map(a=><article key={a.id} className="debt-agreement"><div className="debt-agreement-main"><div><strong>{studentMap.get(a.studentId)?.name??"Aluno"}</strong><span>{a.installmentCount} parcelas · {dateLabel(a.createdAt)}</span></div><div><b>{money(a.negotiatedTotal)}</b><span className={`status ${a.status}`}>{a.status==="active"?"Ativo":a.status==="paid"?"Quitado":a.status==="cancelled"?"Cancelado":a.status==="defaulted"?"Inadimplente":"Rascunho"}</span></div></div>
  {a.downPayment>0&&<div className="debt-entry"><div><strong>Entrada</strong><span>{a.downPaymentPaidAt?`Recebida em ${dateLabel(a.downPaymentPaidAt)}`:"Aguardando pagamento"}</span></div><b>{money(a.downPayment)}</b>{a.status==="active"&&!a.downPaymentPaidAt&&<button className="primary-button small" disabled={busy} onClick={()=>receiveEntry(a)}><ReceiptText size={15}/> Receber entrada</button>}</div>}
  <div className="debt-agreement-actions"><button onClick={()=>toggle(a)}>{expanded[a.id]?"Ocultar parcelas":"Ver parcelas"}</button>{a.status==="active"&&<button className="danger" onClick={()=>void run(async()=>{await cancelDebtNegotiation(schoolId,a.id);await refresh();setMessage({tone:"warning",text:"Acordo cancelado; as mensalidades originais voltaram à cobrança."})})}>Cancelar acordo</button>}</div>
  {expanded[a.id]&&<div className="debt-installments">{expanded[a.id].map(p=><div key={p.id}><span>{p.number}ª parcela · {dateLabel(p.dueDate)}</span><b>{money(p.amount)}</b><em className={`status ${p.status}`}>{p.status==="paid"?"Paga":p.status==="overdue"?"Atrasada":p.status==="cancelled"?"Cancelada":"Pendente"}</em>{a.status==="active"&&p.status!=="paid"&&p.status!=="cancelled"&&<button className="primary-button small" disabled={busy} onClick={()=>receiveInstallment(a,p)}>Receber</button>}</div>)}</div>}</article>):<div className="debt-empty"><CheckCircle2/><span>Nenhum acordo registrado.</span></div>}</div>
 </section>;
}
