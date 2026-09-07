import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function reply(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}})}
function clean(v:unknown,max=500){return typeof v==="string"?v.trim().slice(0,max):""}
function decodeSecret(value:unknown){if(typeof value!=="string"||!value)throw new Error("Credenciais do provedor não encontradas.");const parsed=JSON.parse(value);if(!parsed?.credentials||typeof parsed.credentials!=="object")throw new Error("Credenciais do provedor inválidas.");return parsed.credentials as Record<string,string>}
async function providerFetch(url:string,init:RequestInit){const response=await fetch(url,init);const data=await response.json().catch(()=>({}));return {response,data}}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return reply(405,{error:"Método não permitido."});
  const auth=req.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";if(!token)return reply(401,{error:"Sessão ausente."});
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!serviceKey)return reply(503,{error:"Backend financeiro indisponível."});
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await db.auth.getUser(token);if(userError||!userData.user)return reply(401,{error:"Sessão inválida ou expirada."});
  let body:any={};try{body=await req.json()}catch{return reply(400,{error:"JSON inválido."})}
  const invoiceId=clean(body?.invoiceId,80),cancelInvoice=Boolean(body?.cancelInvoice),reason=clean(body?.reason,500)||(cancelInvoice?"Cobrança cancelada pela escola":"Cobrança bancária removida para reemissão");
  if(!invoiceId)return reply(400,{error:"Mensalidade não informada."});

  const {data:invoice,error:invoiceError}=await db.from("invoices").select("*").eq("id",invoiceId).is("deleted_at",null).maybeSingle();
  if(invoiceError)return reply(500,{error:"Não foi possível carregar a mensalidade."});
  if(!invoice)return reply(404,{error:"Mensalidade não encontrada."});
  const {data:member}=await db.from("school_members").select("role,active").eq("school_id",invoice.school_id).eq("user_id",userData.user.id).eq("active",true).maybeSingle();
  if(!member||!["owner","admin","finance"].includes(member.role))return reply(403,{error:"Seu usuário não possui permissão financeira."});
  if(invoice.status==="paid")return reply(409,{error:"Esta mensalidade já está paga. Um pagamento confirmado deve seguir o fluxo de estorno/reembolso, não o cancelamento de cobrança pendente."});
  const {data:confirmed}=await db.from("payments").select("id").eq("invoice_id",invoice.id).eq("status","confirmed").limit(1).maybeSingle();
  if(confirmed)return reply(409,{error:"Existe pagamento confirmado para esta mensalidade. Atualize a conciliação antes de cancelar."});

  const chargeId=clean(invoice.provider_charge_id,200),provider=clean(invoice.provider,60),metadata:any=invoice.provider_metadata&&typeof invoice.provider_metadata==="object"?invoice.provider_metadata:{};
  const connectionId=clean(metadata.connectionId,80);

  if(chargeId&&provider&&!chargeId.startsWith("manual:")){
    if(!connectionId)return reply(409,{error:"A cobrança externa não possui a conexão bancária registrada. O AulaFácil bloqueou o cancelamento para não perder o vínculo financeiro."});
    const {data:connection}=await db.from("payment_connections").select("*").eq("id",connectionId).eq("school_id",invoice.school_id).eq("provider_key",provider).maybeSingle();
    if(!connection||!connection.credentials_configured)return reply(409,{error:"A conexão usada para criar esta cobrança não está disponível. Restaure a conexão antes de cancelar no provedor."});
    const {data:secretText,error:secretError}=await db.rpc("service_get_payment_connection_secret",{target_connection_id:connection.id});if(secretError||!secretText)return reply(503,{error:"Não foi possível acessar as credenciais protegidas do provedor."});
    const credentials=decodeSecret(secretText);

    if(provider==="asaas"){
      const base=connection.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3",headers={access_token:credentials.api_key};
      const current=await providerFetch(`${base}/payments/${encodeURIComponent(chargeId)}`,{headers});
      if(!current.response.ok)return reply(422,{error:`O Asaas não permitiu confirmar o estado atual da cobrança (${current.response.status}). Nada foi alterado no AulaFácil.`});
      const status=String(current.data?.status??"");
      if(["RECEIVED","CONFIRMED","RECEIVED_IN_CASH","REFUNDED"].includes(status))return reply(409,{error:`O Asaas informa que a cobrança está em estado ${status}. O AulaFácil não vai removê-la como se estivesse pendente; faça a conciliação financeira primeiro.`});
      if(status!=="DELETED"){
        const removed=await providerFetch(`${base}/payments/${encodeURIComponent(chargeId)}`,{method:"DELETE",headers});
        if(!removed.response.ok)return reply(422,{error:`O Asaas recusou a remoção da cobrança (${removed.response.status}). O AulaFácil manteve o vínculo original.`});
      }
    }else if(provider==="mercado_pago"){
      const headers={Authorization:`Bearer ${credentials.access_token}`,"Content-Type":"application/json"};
      const current=await providerFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(chargeId)}`,{headers});
      if(!current.response.ok)return reply(422,{error:`O Mercado Pago não permitiu confirmar o estado atual da cobrança (${current.response.status}). Nada foi alterado.`});
      const status=String(current.data?.status??"").toLowerCase();
      if(["approved","refunded","charged_back"].includes(status))return reply(409,{error:`O Mercado Pago informa que o pagamento está ${status}. O cancelamento de uma cobrança pendente foi bloqueado; concilie o pagamento/reembolso primeiro.`});
      if(!["cancelled","canceled"].includes(status)){
        if(!["pending","in_process","authorized"].includes(status))return reply(409,{error:`O Mercado Pago não permite cancelar automaticamente uma cobrança no estado ${status||"desconhecido"}. Nenhum dado foi alterado.`});
        const cancelled=await providerFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(chargeId)}`,{method:"PUT",headers,body:JSON.stringify({status:"cancelled"})});
        if(!cancelled.response.ok)return reply(422,{error:`O Mercado Pago recusou o cancelamento (${cancelled.response.status}). O AulaFácil manteve o vínculo original.`});
      }
    }else if(provider==="pagarme"){
      const headers={Authorization:`Basic ${btoa(`${credentials.secret_key}:`)}`,"Content-Type":"application/json"};
      const current=await providerFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(chargeId)}`,{headers});
      if(!current.response.ok)return reply(422,{error:`O Pagar.me não permitiu confirmar a cobrança (${current.response.status}). Nada foi alterado.`});
      const status=String(current.data?.status??"").toLowerCase();
      if(["paid","captured","refunded","partial_refunded","chargedback"].includes(status))return reply(409,{error:`O Pagar.me informa que a cobrança está ${status}. O AulaFácil não realizará cancelamento de cobrança pendente nesse estado.`});
      if(!["canceled","cancelled","voided"].includes(status)){
        const cancelled=await providerFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(chargeId)}`,{method:"DELETE",headers});
        if(!cancelled.response.ok)return reply(422,{error:`O Pagar.me recusou o cancelamento (${cancelled.response.status}). O AulaFácil manteve o vínculo original.`});
      }
    }else return reply(409,{error:"Este provedor ainda não possui cancelamento seguro implementado. Nenhum dado foi alterado."});
  }

  const {data:finalized,error:finalizeError}=await db.rpc("service_finalize_provider_charge_cancellation",{target_invoice:invoice.id,target_provider_charge_id:chargeId||null,target_cancel_invoice:cancelInvoice,target_reason:reason});
  if(finalizeError)return reply(500,{error:"A cobrança foi interrompida no provedor, mas o AulaFácil não conseguiu finalizar a atualização interna. Não gere outra cobrança ainda; execute a conciliação."});
  return reply(200,{ok:true,providerChargeCancelled:Boolean(chargeId),invoiceCancelled:cancelInvoice,result:finalized});
});