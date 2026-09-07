import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ProviderKey="asaas"|"mercado_pago"|"efi"|"pagarme"|"stripe";
type CredentialField={key:string;required:boolean;max:number};
const FIELDS:Record<ProviderKey,CredentialField[]>={
  asaas:[{key:"api_key",required:true,max:4096}],
  mercado_pago:[{key:"access_token",required:true,max:4096}],
  efi:[{key:"client_id",required:true,max:4096},{key:"client_secret",required:true,max:4096},{key:"certificate",required:false,max:16000},{key:"certificate_password",required:false,max:4096}],
  pagarme:[{key:"secret_key",required:true,max:4096}],
  stripe:[{key:"secret_key",required:true,max:4096}],
};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
function response(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}})}
function validateCredentials(provider:ProviderKey,value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Credenciais inválidas.");
  const input=value as Record<string,unknown>,out:Record<string,string>={};
  for(const field of FIELDS[provider]){
    const raw=input[field.key];
    if(raw===undefined||raw===null||raw===""){if(field.required)throw new Error(`Campo obrigatório ausente: ${field.key}.`);continue}
    if(typeof raw!=="string")throw new Error(`Credencial inválida: ${field.key}.`);
    const normalized=raw.trim();
    if(!normalized&&field.required)throw new Error(`Campo obrigatório vazio: ${field.key}.`);
    if(normalized.length>field.max)throw new Error(`Credencial muito longa: ${field.key}.`);
    if(normalized)out[field.key]=normalized;
  }
  return out;
}
function randomHex(bytes=32){const buf=new Uint8Array(bytes);crypto.getRandomValues(buf);return Array.from(buf).map(x=>x.toString(16).padStart(2,"0")).join("")}
function decodeSecret(value:unknown){if(typeof value!=="string"||!value)return null;try{const parsed=JSON.parse(value);return parsed?.credentials&&typeof parsed.credentials==="object"?parsed.credentials as Record<string,string>:null}catch{return null}}
async function readProviderBody(res:Response){const text=await res.text().catch(()=>"");if(!text)return "";try{const parsed=JSON.parse(text);const err=parsed?.errors?.[0]?.description??parsed?.message??parsed?.error_description??parsed?.error;return err?String(err):text.slice(0,400)}catch{return text.slice(0,400)}}
async function jsonFetch(url:string,init:RequestInit){const res=await fetch(url,init);const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`provider ${res.status}: ${JSON.stringify(data).slice(0,600)}`);return data}

async function validateProviderAccess(provider:ProviderKey,credentials:Record<string,string>,environment:string){
  if(provider==="asaas"){
    const base=environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
    const res=await fetch(`${base}/customers?limit=1&offset=0`,{headers:{"Content-Type":"application/json","User-Agent":"AulaFacil/0.4.15",access_token:credentials.api_key}});
    if(!res.ok){const detail=await readProviderBody(res);if(res.status===401||res.status===403)throw new Error(`API Key do Asaas recusada no ambiente ${environment==="sandbox"?"Sandbox":"Produção"}. Confira se a chave pertence a esse mesmo ambiente.${detail?` Motivo: ${detail}`:""}`);throw new Error(`O Asaas não aceitou a validação da API (${res.status}).${detail?` Motivo: ${detail}`:""}`)}
    return {providerName:"Asaas",validatedEndpoint:"customers"};
  }
  if(provider==="mercado_pago"){
    const res=await fetch("https://api.mercadopago.com/users/me",{headers:{Authorization:`Bearer ${credentials.access_token}`,"Content-Type":"application/json"}});
    if(!res.ok){const detail=await readProviderBody(res);if(res.status===401||res.status===403)throw new Error(`Access Token do Mercado Pago recusado. Confira a credencial.${detail?` Motivo: ${detail}`:""}`);throw new Error(`O Mercado Pago não aceitou a validação da API (${res.status}).${detail?` Motivo: ${detail}`:""}`)}
    return {providerName:"Mercado Pago",validatedEndpoint:"users/me"};
  }
  if(provider==="pagarme"){
    const res=await fetch("https://api.pagar.me/core/v5/orders?page=1&size=1",{headers:{Authorization:`Basic ${btoa(`${credentials.secret_key}:`)}`,"Content-Type":"application/json"}});
    if(!res.ok){const detail=await readProviderBody(res);if(res.status===401||res.status===403)throw new Error(`Secret Key do Pagar.me recusada. Confira a credencial.${detail?` Motivo: ${detail}`:""}`);throw new Error(`O Pagar.me não aceitou a validação da API (${res.status}).${detail?` Motivo: ${detail}`:""}`)}
    return {providerName:"Pagar.me",validatedEndpoint:"orders"};
  }
  return {providerName:provider,validatedEndpoint:"not_applicable"};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return response(405,{error:"Método não permitido."});
 const authHeader=req.headers.get("Authorization")??"",token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
 if(!token)return response(401,{error:"Sessão ausente."});
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!serviceKey)return response(503,{error:"Backend financeiro indisponível."});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userData,error:userError}=await admin.auth.getUser(token);if(userError||!userData.user)return response(401,{error:"Sessão inválida ou expirada."});
 let body:any;try{body=await req.json()}catch{return response(400,{error:"JSON inválido."})}
 const connectionId=typeof body?.connectionId==="string"?body.connectionId:"",action=typeof body?.action==="string"?body.action:"configure";
 if(!connectionId)return response(400,{error:"Conexão de pagamento não informada."});
 const {data:connection,error:connectionError}=await admin.from("payment_connections").select("id,school_id,provider_key,environment,public_config").eq("id",connectionId).maybeSingle();
 if(connectionError)return response(500,{error:"Não foi possível validar a conexão."});if(!connection)return response(404,{error:"Conexão de pagamento não encontrada."});
 const {data:member}=await admin.from("school_members").select("role,active").eq("school_id",connection.school_id).eq("user_id",userData.user.id).eq("active",true).maybeSingle();
 if(!member||!["owner","admin"].includes(member.role))return response(403,{error:"Somente proprietário ou administrador pode alterar credenciais bancárias."});

 const asaasBase=connection.environment==="sandbox"?"https://api-sandbox.asaas.com/v3":"https://api.asaas.com/v3";
 const webhookName=`AulaFacil pagamentos ${connection.id.slice(0,8)}`;
 const ownsWebhook=(item:any)=>String(item?.url??"").includes(`connection=${encodeURIComponent(connection.id)}`)||String(item?.url??"").includes(`connection=${connection.id}`)||String(item?.name??"")===webhookName;

 try{
  if(action==="configure"){
   const provider=connection.provider_key as ProviderKey;if(!(provider in FIELDS))return response(400,{error:"Este provedor não utiliza credenciais secretas por esta função."});
   const credentials=validateCredentials(provider,body?.credentials);
   let validation:{providerName:string;validatedEndpoint:string};
   try{validation=await validateProviderAccess(provider,credentials,connection.environment)}catch(error){return response(422,{error:String(error instanceof Error?error.message:error).slice(0,700),credentialsConfigured:false,credentialValidation:"rejected"});}

   const credentialValidatedAt=new Date().toISOString();
   const webhookToken=randomHex(32);credentials.webhook_token=webhookToken;
   let webhookMode="verificacao_automatica",webhookId="",webhookSetupError="";
   if(provider==="asaas"){
    const authToken=randomHex(32);credentials.asaas_webhook_auth_token=authToken;
    const headers={"Content-Type":"application/json","User-Agent":"AulaFacil/0.4.15",access_token:credentials.api_key};
    const hookUrl=`${url}/functions/v1/payment-webhook?provider=asaas&connection=${encodeURIComponent(connection.id)}&hook=${encodeURIComponent(webhookToken)}`;
    const payload={name:webhookName,url:hookUrl,email:userData.user.email||"",enabled:true,interrupted:false,apiVersion:3,authToken,sendType:"SEQUENTIALLY",events:["PAYMENT_RECEIVED","PAYMENT_CONFIRMED","PAYMENT_REFUNDED","PAYMENT_PARTIALLY_REFUNDED","PAYMENT_REFUND_IN_PROGRESS","PAYMENT_REFUND_DENIED"]};
    try{
      const list=await jsonFetch(`${asaasBase}/webhooks?limit=100`,{headers});
      const rows=Array.isArray(list?.data)?list.data:[];
      const existing=rows.find(ownsWebhook);
      if(existing?.id){const updated=await jsonFetch(`${asaasBase}/webhooks/${encodeURIComponent(existing.id)}`,{method:"PUT",headers,body:JSON.stringify(payload)});webhookId=String(updated?.id??existing.id)}
      else {const created=await jsonFetch(`${asaasBase}/webhooks`,{method:"POST",headers,body:JSON.stringify(payload)});webhookId=String(created?.id??"")}
      webhookMode="webhook_automatico";
    }catch(error){webhookMode="conciliacao_automatica";webhookSetupError=String(error instanceof Error?error.message:error).slice(0,500);credentials.webhook_setup_error=webhookSetupError}
   }else if(provider==="mercado_pago")webhookMode="webhook_por_cobranca";
   else if(provider==="pagarme")webhookMode="dashboard_necessario_com_conciliacao";

   const secretPayload=JSON.stringify({provider,credentials,updatedAt:new Date().toISOString()});
   const {error}=await admin.rpc("service_set_payment_connection_secret",{target_connection_id:connectionId,secret_payload:secretPayload});if(error)throw error;
   const publicConfig={...(connection.public_config??{}),webhookMode,automaticConfirmation:true,webhookId:webhookId||undefined,webhookName:provider==="asaas"?webhookName:undefined,webhookSetupError:webhookSetupError||undefined,credentialValidation:"validated",credentialValidatedAt,credentialValidationProvider:provider};
   await admin.from("payment_connections").update({public_config:publicConfig}).eq("id",connectionId);
   return response(200,{ok:true,credentialsConfigured:true,credentialValidation:"validated",credentialValidatedAt,providerName:validation.providerName,environment:connection.environment,automaticConfirmation:true,webhookMode,webhookId:webhookId||null,warning:webhookSetupError||null});
  }

  if(action==="clear"||action==="delete"){
    if(connection.provider_key==="asaas"){
      try{
        const {data:secretText}=await admin.rpc("service_get_payment_connection_secret",{target_connection_id:connectionId});const current=decodeSecret(secretText);
        if(current?.api_key){
          const headers={"Content-Type":"application/json","User-Agent":"AulaFacil/0.4.15",access_token:current.api_key};
          const list=await jsonFetch(`${asaasBase}/webhooks?limit=100`,{headers});const rows=Array.isArray(list?.data)?list.data:[];
          for(const item of rows.filter(ownsWebhook)){if(item?.id)await fetch(`${asaasBase}/webhooks/${encodeURIComponent(item.id)}`,{method:"DELETE",headers}).catch(()=>undefined)}
        }
      }catch{}
    }
    const {error:clearError}=await admin.rpc("service_clear_payment_connection_secret",{target_connection_id:connectionId});if(clearError)throw clearError;
    if(action==="delete"){
      const {error:deleteError}=await admin.from("payment_connections").delete().eq("id",connectionId);if(deleteError)throw deleteError;
      return response(200,{ok:true,deleted:true});
    }
    const nextConfig={...(connection.public_config??{}),webhookMode:"desativado",automaticConfirmation:false,credentialValidation:"unconfigured",credentialValidatedAt:null,credentialValidationProvider:null};
    await admin.from("payment_connections").update({public_config:nextConfig}).eq("id",connectionId);
    return response(200,{ok:true,credentialsConfigured:false,credentialValidation:"unconfigured"});
  }
  return response(400,{error:"Ação desconhecida."});
 }catch(error){return response(500,{error:"Não foi possível atualizar a configuração bancária. Nenhum segredo foi devolvido ao aplicativo.",detail:String(error instanceof Error?error.message:error).slice(0,300)})}
});
