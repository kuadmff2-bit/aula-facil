import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function reply(status:number, body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
function clean(v:unknown,max=500){return typeof v==="string"?v.trim().slice(0,max):""}
function decodeSecret(value:unknown){if(typeof value!=="string"||!value)throw new Error("missing secret");const parsed=JSON.parse(value);if(!parsed?.credentials||typeof parsed.credentials!=="object")throw new Error("invalid secret");return parsed.credentials as Record<string,string>}
async function jsonFetch(url:string,init:RequestInit){const res=await fetch(url,init);const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`provider ${res.status}: ${JSON.stringify(data).slice(0,500)}`);return data}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function positive(value:unknown){const n=Number(value??0);return Number.isFinite(n)&&n>0?n:0}

type ProviderState={status:string;paid:boolean;paidAt:string;externalReference:string;amount:number;refundState:"none"|"pending"|"partial"|"full"|"denied"|"chargeback";refundedAmount:number;refundMetadata:Record<string,unknown>};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return reply(405,{error:"method not allowed"});
  const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceKey)return reply(503,{error:"backend unavailable"});
  const db=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const requestUrl=new URL(req.url),provider=clean(requestUrl.searchParams.get("provider"),40),connectionId=clean(requestUrl.searchParams.get("connection"),80),hook=clean(requestUrl.searchParams.get("hook"),300);
  if(!["asaas","mercado_pago","pagarme"].includes(provider)||!connectionId)return reply(400,{error:"invalid webhook target"});

  const raw=await req.text();let body:any={};try{body=raw?JSON.parse(raw):{}}catch{return reply(400,{error:"invalid json"})}
  const {data:connection}=await db.from("payment_connections").select("*").eq("id",connectionId).eq("provider_key",provider).maybeSingle();
  if(!connection||!connection.credentials_configured)return reply(404,{error:"connection not found"});
  const {data:secretText,error:secretError}=await db.rpc("service_get_payment_connection_secret",{target_connection_id:connection.id});
  if(secretError||!secretText)return reply(503,{error:"credentials unavailable"});
  const credentials=decodeSecret(secretText),expectedHook=clean(credentials.webhook_token,300);
  if(!expectedHook||hook!==expectedHook)return reply(401,{error:"invalid webhook token"});
  if(provider==="asaas"){
    const header=req.headers.get("asaas-access-token")??"",expected=credentials.asaas_webhook_auth_token??expectedHook;
    if(!header||header!==expected)return reply(401,{error:"invalid asaas token"});
  }

  let paymentId="",eventType=clean(body?.event??body?.type??body?.action,160)||"unknown",externalReference="";
  if(provider==="asaas"){paymentId=clean(body?.payment?.id,160);externalReference=clean(body?.payment?.externalReference,160)}
  else if(provider==="mercado_pago"){paymentId=clean(body?.data?.id??body?.id,160);externalReference=clean(body?.external_reference,160)}
  else {paymentId=clean(body?.data?.id??body?.id,160);externalReference=clean(body?.data?.code??body?.code,160)}
  const payloadHash=await sha256(raw||JSON.stringify(body));
  const providerEventId=`${connectionId}:${clean(body?.id??body?.eventId??body?.event_id,200)||paymentId||payloadHash}`;

  const inserted=await db.from("integration_events").insert({provider,provider_event_id:providerEventId,event_type:eventType,school_id:connection.school_id,status:"received",payload_hash:payloadHash});
  if(inserted.error&&String(inserted.error.code)!=="23505")return reply(500,{error:"event log failed"});
  if(inserted.error&&String(inserted.error.code)==="23505"){
    const {data:previous}=await db.from("integration_events").select("status").eq("provider",provider).eq("provider_event_id",providerEventId).maybeSingle();
    if(previous?.status==="processed"||previous?.status==="ignored")return reply(200,{ok:true,duplicate:true});
  }
  await db.from("integration_events").update({status:"processing",last_error:null}).eq("provider",provider).eq("provider_event_id",providerEventId);

  try{
    if(!paymentId)throw new Error("payment id missing");
    const now=new Date().toISOString();
    let state:ProviderState={status:"",paid:false,paidAt:now,externalReference,amount:0,refundState:"none",refundedAmount:0,refundMetadata:{}};

    if(provider==="asaas"){
      const base=connection.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
      const headers={access_token:credentials.api_key};
      const p=await jsonFetch(`${base}/payments/${encodeURIComponent(paymentId)}`,{headers});
      state.status=String(p.status??"");
      state.paid=["RECEIVED","CONFIRMED","RECEIVED_IN_CASH"].includes(state.status);
      state.externalReference=String(p.externalReference??state.externalReference);
      state.amount=positive(p.value);
      state.paidAt=p.paymentDate?`${p.paymentDate}T12:00:00Z`:p.clientPaymentDate?`${p.clientPaymentDate}T12:00:00Z`:state.paidAt;
      let refunds=Array.isArray(p.refunds)?p.refunds:[];
      if(eventType.includes("REFUND")&&!refunds.length){
        try{const r=await jsonFetch(`${base}/payments/${encodeURIComponent(paymentId)}/refunds`,{headers});refunds=Array.isArray(r?.data)?r.data:Array.isArray(r)?r:[]}catch{/* webhook event still guides state below */}
      }
      const done=refunds.filter((r:any)=>String(r?.status)==="DONE");
      const pending=refunds.some((r:any)=>String(r?.status)==="PENDING");
      state.refundedAmount=done.reduce((sum:number,r:any)=>sum+positive(r?.value),0);
      state.refundMetadata={event:eventType,refunds:refunds.slice(0,20).map((r:any)=>({status:r?.status,value:r?.value,dateCreated:r?.dateCreated,transactionReceiptUrl:r?.transactionReceiptUrl??null}))};
      if(eventType==="PAYMENT_REFUNDED"||state.status==="REFUNDED") {state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
      else if(eventType==="PAYMENT_PARTIALLY_REFUNDED"||(state.refundedAmount>0&&state.amount>state.refundedAmount)) state.refundState="partial";
      else if(eventType==="PAYMENT_REFUND_IN_PROGRESS"||pending) state.refundState="pending";
      else if(eventType==="PAYMENT_REFUND_DENIED") state.refundState="denied";
      else if(state.refundedAmount>0&&state.amount>0&&state.refundedAmount>=state.amount){state.refundState="full";state.refundedAmount=state.amount;}
    }else if(provider==="mercado_pago"){
      const p=await jsonFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${credentials.access_token}`}});
      state.status=String(p.status??"").toLowerCase();
      state.paid=state.status==="approved";
      state.externalReference=String(p.external_reference??state.externalReference);
      state.amount=positive(p.transaction_amount);
      state.paidAt=p.date_approved||p.date_last_updated||state.paidAt;
      state.refundedAmount=positive(p.transaction_amount_refunded);
      state.refundMetadata={status_detail:p.status_detail??null,transaction_amount_refunded:state.refundedAmount};
      if(state.status==="refunded"){state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
      else if(state.status==="charged_back"){state.refundState="chargeback";state.refundedAmount=state.amount||state.refundedAmount;}
      else if(state.refundedAmount>0&&state.amount>state.refundedAmount)state.refundState="partial";
    }else{
      const p=await jsonFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Basic ${btoa(`${credentials.secret_key}:`)}`}});
      state.status=String(p.status??p.last_transaction?.status??"").toLowerCase();
      state.paid=["paid","captured"].includes(state.status);
      state.externalReference=String(p.code??p.metadata?.aulafacil_invoice_id??state.externalReference);
      state.amount=positive(p.amount)/100;
      state.paidAt=p.paid_at||p.updated_at||state.paidAt;
      const refundedCents=positive(p.refunded_amount??p.amount_refunded??p.last_transaction?.refunded_amount);
      state.refundedAmount=refundedCents/100;
      state.refundMetadata={charge_status:state.status,last_transaction_status:p.last_transaction?.status??null,refunded_amount:state.refundedAmount};
      if(state.status==="chargedback"){state.refundState="chargeback";state.refundedAmount=state.amount||state.refundedAmount;}
      else if(state.status==="refunded"){state.refundState="full";state.refundedAmount=state.amount||state.refundedAmount;}
      else if(state.status==="partial_refunded"){state.refundState="partial";}
      else if(state.status==="waiting_cancellation")state.refundState="pending";
    }

    let invoiceQuery=db.from("invoices").select("*").eq("school_id",connection.school_id).eq("provider",provider).is("deleted_at",null);
    if(state.externalReference&&/^[0-9a-f-]{36}$/i.test(state.externalReference))invoiceQuery=invoiceQuery.eq("id",state.externalReference);else invoiceQuery=invoiceQuery.eq("provider_charge_id",paymentId);
    const {data:invoice,error:invoiceError}=await invoiceQuery.maybeSingle();
    if(invoiceError||!invoice)throw new Error("invoice not found");
    if(String(invoice.provider_charge_id??"")!==paymentId)throw new Error("provider charge does not match invoice");
    const metadata:any=invoice.provider_metadata&&typeof invoice.provider_metadata==="object"?invoice.provider_metadata:{};

    const meaningfulStatusChange=String(metadata.providerStatus??"")!==state.status;
    if(meaningfulStatusChange){
      await db.from("invoices").update({provider_metadata:{...metadata,providerStatus:state.status,lastWebhookAt:now}}).eq("id",invoice.id);
    }

    const ensurePayment=async()=>{
      const {data:existing}=await db.from("payments").select("id,status").eq("provider",provider).eq("provider_payment_id",paymentId).maybeSingle();
      if(existing)return existing;
      const generatedDate=String(metadata.generatedAt??state.paidAt).slice(0,10);
      const amount=state.amount||Number(metadata.amount??invoice.amount);
      const {data:confirmation,error}=await db.rpc("service_confirm_provider_payment",{
        target_invoice:invoice.id,target_connection:connection.id,target_provider:provider,target_provider_payment_id:paymentId,
        target_provider_status:state.status||"provider",target_paid_at:state.paidAt,target_amount:amount,target_generated_date:generatedDate,
        target_method:String(metadata.method??"provider"),target_source:`webhook:${providerEventId}:refund-history`,
      });
      if(error)throw error;return Array.isArray(confirmation)?confirmation[0]:confirmation;
    };

    if(state.refundState!=="none"){
      if(["full","partial","chargeback"].includes(state.refundState))await ensurePayment();
      const {error:refundError}=await db.rpc("service_apply_provider_refund",{
        target_provider:provider,target_provider_payment_id:paymentId,target_refunded_amount:state.refundedAmount,
        target_refund_state:state.refundState,target_source:`webhook:${providerEventId}`,target_reason:`${provider} ${eventType || state.status}`,
        target_metadata:state.refundMetadata,
      });
      if(refundError)throw refundError;
      await db.from("integration_events").update({status:"processed",processed_at:now,last_error:null}).eq("provider",provider).eq("provider_event_id",providerEventId);
      return reply(200,{ok:true,refund:true,refundState:state.refundState,refundedAmount:state.refundedAmount,status:state.status});
    }

    if(!state.paid){
      await db.from("integration_events").update({status:"processed",processed_at:now,last_error:null}).eq("provider",provider).eq("provider_event_id",providerEventId);
      return reply(200,{ok:true,paid:false,status:state.status});
    }

    const generatedDate=String(metadata.generatedAt??state.paidAt).slice(0,10);
    const amount=state.amount||Number(metadata.amount??invoice.amount);
    const {data:confirmation,error:confirmationError}=await db.rpc("service_confirm_provider_payment",{
      target_invoice:invoice.id,target_connection:connection.id,target_provider:provider,target_provider_payment_id:paymentId,
      target_provider_status:state.status,target_paid_at:state.paidAt,target_amount:amount,target_generated_date:generatedDate,
      target_method:String(metadata.method??"provider"),target_source:`webhook:${providerEventId}`,
    });
    if(confirmationError)throw confirmationError;

    await db.from("integration_events").update({status:"processed",processed_at:now,last_error:null}).eq("provider",provider).eq("provider_event_id",providerEventId);
    const row=Array.isArray(confirmation)?confirmation[0]:confirmation;
    return reply(200,{ok:true,paid:true,existing:Boolean(row?.was_existing),receiptNumber:row?.receipt_number??null});
  }catch(error){
    const message=String(error instanceof Error?error.message:error).slice(0,700);
    await db.from("integration_events").update({status:"failed",processed_at:new Date().toISOString(),last_error:message}).eq("provider",provider).eq("provider_event_id",providerEventId);
    return reply(422,{error:"webhook could not be verified"});
  }
});