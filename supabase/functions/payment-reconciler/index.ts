import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function reply(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function decodeSecret(value:unknown){if(typeof value!=="string"||!value)throw new Error("missing secret");const parsed=JSON.parse(value);if(!parsed?.credentials||typeof parsed.credentials!=="object")throw new Error("invalid secret");return parsed.credentials as Record<string,string>}
async function jsonFetch(url:string,init:RequestInit){const response=await fetch(url,init);const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`provider ${response.status}: ${JSON.stringify(data).slice(0,500)}`);return data}
function positive(value:unknown){const n=Number(value??0);return Number.isFinite(n)&&n>0?n:0}
type RefundState="none"|"pending"|"partial"|"full"|"denied"|"chargeback";
type State={status:string;paid:boolean;paidAt:string;amount:number;refundState:RefundState;refundedAmount:number;refundMetadata:Record<string,unknown>};

async function fetchState(provider:string,connection:any,credentials:Record<string,string>,chargeId:string):Promise<State>{
  const now=new Date().toISOString();
  const state:State={status:"",paid:false,paidAt:now,amount:0,refundState:"none",refundedAmount:0,refundMetadata:{}};
  if(provider==="asaas"){
    const base=connection.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
    const p=await jsonFetch(`${base}/payments/${encodeURIComponent(chargeId)}`,{headers:{access_token:credentials.api_key}});
    state.status=String(p.status??"");state.paid=["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(state.status);
    state.amount=positive(p.value);state.paidAt=p.paymentDate?`${p.paymentDate}T12:00:00Z`:p.clientPaymentDate?`${p.clientPaymentDate}T12:00:00Z`:now;
    const refunds=Array.isArray(p.refunds)?p.refunds:[];
    const done=refunds.filter((r:any)=>String(r?.status)==="DONE"),pending=refunds.some((r:any)=>String(r?.status)==="PENDING");
    state.refundedAmount=done.reduce((sum:number,r:any)=>sum+positive(r?.value),0);
    state.refundMetadata={refunds:refunds.slice(0,20).map((r:any)=>({status:r?.status,value:r?.value,dateCreated:r?.dateCreated,transactionReceiptUrl:r?.transactionReceiptUrl??null}))};
    if(state.status==="REFUNDED"){state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
    else if(state.refundedAmount>0&&state.amount>0&&state.refundedAmount>=state.amount){state.refundState="full";state.refundedAmount=state.amount;}
    else if(state.refundedAmount>0)state.refundState="partial";
    else if(pending)state.refundState="pending";
  }else if(provider==="mercado_pago"){
    const p=await jsonFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(chargeId)}`,{headers:{Authorization:`Bearer ${credentials.access_token}`}});
    state.status=String(p.status??"").toLowerCase();state.paid=state.status==="approved";state.amount=positive(p.transaction_amount);
    state.paidAt=p.date_approved||p.date_last_updated||now;state.refundedAmount=positive(p.transaction_amount_refunded);
    state.refundMetadata={status_detail:p.status_detail??null,transaction_amount_refunded:state.refundedAmount};
    if(state.status==="refunded"){state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
    else if(state.status==="charged_back"){state.refundState="chargeback";state.refundedAmount=state.amount||state.refundedAmount;}
    else if(state.refundedAmount>0&&state.amount>state.refundedAmount)state.refundState="partial";
  }else if(provider==="pagarme"){
    const p=await jsonFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(chargeId)}`,{headers:{Authorization:`Basic ${btoa(`${credentials.secret_key}:`)}`}});
    state.status=String(p.status??p.last_transaction?.status??"").toLowerCase();state.paid=["paid","captured"].includes(state.status);state.amount=positive(p.amount)/100;
    state.paidAt=p.paid_at||p.updated_at||now;state.refundedAmount=positive(p.refunded_amount??p.amount_refunded??p.last_transaction?.refunded_amount)/100;
    state.refundMetadata={charge_status:state.status,last_transaction_status:p.last_transaction?.status??null,refunded_amount:state.refundedAmount};
    if(state.status==="chargedback"){state.refundState="chargeback";state.refundedAmount=state.amount||state.refundedAmount;}
    else if(state.status==="refunded"){state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
    else if(state.status==="partial_refunded")state.refundState="partial";
    else if(state.status==="waiting_cancellation")state.refundState="pending";
  }
  return state;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{error:"method not allowed"});
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!serviceKey)return reply(503,{error:"backend unavailable"});
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:expectedToken}=await db.rpc("service_get_system_secret",{target_name:"payment_reconciler_token"});
  if(!expectedToken||(req.headers.get("x-aulafacil-cron")??"")!==expectedToken)return reply(401,{error:"unauthorized"});

  const now=new Date(),nowIso=now.toISOString();
  const paidCutoff=new Date(now.getTime()-180*86400000).toISOString();
  const {data:openRows,error:openError}=await db.from("invoices").select("id,school_id,student_id,amount,status,paid_at,provider,provider_charge_id,provider_metadata,updated_at").in("status",["pending","overdue"]).not("provider_charge_id","is",null).in("provider",["asaas","mercado_pago","pagarme"]).is("deleted_at",null).order("updated_at",{ascending:true}).limit(150);
  if(openError)return reply(500,{error:"invoice query failed"});
  const {data:paidRows,error:paidError}=await db.from("invoices").select("id,school_id,student_id,amount,status,paid_at,provider,provider_charge_id,provider_metadata,updated_at").eq("status","paid").gte("paid_at",paidCutoff).not("provider_charge_id","is",null).in("provider",["asaas","mercado_pago","pagarme"]).is("deleted_at",null).order("paid_at",{ascending:false}).limit(150);
  if(paidError)return reply(500,{error:"paid invoice query failed"});
  const unique=new Map<string,any>();for(const row of [...(openRows??[]),...(paidRows??[])])unique.set(String(row.id),row);
  const invoices=[...unique.values()];
  const ids=invoices.map(x=>x.id);
  const {data:checks}=ids.length?await db.from("provider_reconciliation_state").select("*").in("invoice_id",ids):{data:[] as any[]};
  const checkMap=new Map((checks??[]).map((x:any)=>[String(x.invoice_id),x]));

  let checked=0,confirmed=0,repaired=0,refunds=0,skipped=0,failed=0;
  for(const invoice of invoices){
    const prior:any=checkMap.get(String(invoice.id));
    if(prior?.next_check_at&&new Date(prior.next_check_at)>now){skipped++;continue;}
    const metadata:any=invoice.provider_metadata&&typeof invoice.provider_metadata==="object"?invoice.provider_metadata:{};
    const connectionId=String(metadata.connectionId??"");if(!connectionId){failed++;continue;}
    checked++;
    try{
      const {data:connection}=await db.from("payment_connections").select("*").eq("id",connectionId).eq("school_id",invoice.school_id).maybeSingle();
      if(!connection||!connection.credentials_configured)throw new Error("payment connection unavailable");
      const {data:secretText,error:secretError}=await db.rpc("service_get_payment_connection_secret",{target_connection_id:connection.id});if(secretError||!secretText)throw new Error("credentials unavailable");
      const credentials=decodeSecret(secretText),state=await fetchState(String(invoice.provider),connection,credentials,String(invoice.provider_charge_id));

      const {data:existing}=await db.from("payments").select("id,status,amount_received,paid_at,receipt_number,refunded_amount,refund_status").eq("provider",invoice.provider).eq("provider_payment_id",invoice.provider_charge_id).maybeSingle();
      const ensureConfirmed=async()=>{
        const generatedDate=String(metadata.generatedAt??state.paidAt).slice(0,10),amount=state.amount||Number(metadata.amount??invoice.amount);
        const {data,error}=await db.rpc("service_confirm_provider_payment",{target_invoice:invoice.id,target_connection:connection.id,target_provider:invoice.provider,target_provider_payment_id:invoice.provider_charge_id,target_provider_status:state.status||"confirmed",target_paid_at:existing?.paid_at??state.paidAt,target_amount:existing?.amount_received??amount,target_generated_date:generatedDate,target_method:String(metadata.method??"provider"),target_source:"reconciler:provider-check"});
        if(error)throw error;return data;
      };

      if(state.refundState!=="none"){
        if(["full","partial","chargeback"].includes(state.refundState)&&!existing)await ensureConfirmed();
        const {error}=await db.rpc("service_apply_provider_refund",{target_provider:invoice.provider,target_provider_payment_id:invoice.provider_charge_id,target_refunded_amount:state.refundedAmount,target_refund_state:state.refundState,target_source:"reconciler:provider-check",target_reason:`${invoice.provider} ${state.status}`,target_metadata:state.refundMetadata});
        if(error)throw error;refunds++;
      }else if(state.paid){
        const wasPaid=invoice.status==="paid"&&existing?.status==="confirmed";
        await ensureConfirmed();if(wasPaid)repaired+=0;else if(existing)repaired++;else confirmed++;
      }else if(existing?.status==="confirmed"&&invoice.status!=="paid"){
        await ensureConfirmed();repaired++;
      }

      if(String(metadata.providerStatus??"")!==state.status){
        await db.from("invoices").update({provider_metadata:{...metadata,providerStatus:state.status}}).eq("id",invoice.id);
      }
      const nextMinutes=invoice.status==="paid"?360:10;
      await db.from("provider_reconciliation_state").upsert({invoice_id:invoice.id,school_id:invoice.school_id,provider:invoice.provider,provider_charge_id:invoice.provider_charge_id,last_status:state.status,last_checked_at:nowIso,next_check_at:new Date(now.getTime()+nextMinutes*60000).toISOString(),failure_count:0,last_error:null,updated_at:nowIso},{onConflict:"invoice_id"});
    }catch(error){
      failed++;const message=String(error instanceof Error?error.message:error).slice(0,700),failures=Number(prior?.failure_count??0)+1,backoff=Math.min(360,Math.max(10,10*Math.pow(2,Math.min(failures-1,5))));
      await db.from("provider_reconciliation_state").upsert({invoice_id:invoice.id,school_id:invoice.school_id,provider:invoice.provider,provider_charge_id:invoice.provider_charge_id,last_checked_at:nowIso,next_check_at:new Date(now.getTime()+backoff*60000).toISOString(),failure_count:failures,last_error:message,updated_at:nowIso},{onConflict:"invoice_id"});
      await db.from("audit_logs").insert({school_id:invoice.school_id,action:"payment_reconciliation_failed",entity_type:"invoice",entity_id:invoice.id,metadata:{provider:invoice.provider,error:message,failure_count:failures}});
    }
  }
  return reply(200,{ok:true,checked,confirmed,repaired,refunds,skipped,failed});
});