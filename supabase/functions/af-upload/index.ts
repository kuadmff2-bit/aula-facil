import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.115.0';
const max = 2 * 1024 * 1024;
const origins = ['http://tauri.localhost', 'https://tauri.localhost', ...(Deno.env.get('AF_ALLOWED_ORIGINS') || '').split(',').map(v => v.trim()).filter(Boolean)];
Deno.serve(async (req: Request) => {
 const origin=req.headers.get('origin') || '';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-school-id,x-student-id';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
 const reply=(status:number,error:string)=>new Response(JSON.stringify({error}),{status,headers});
 if(origin&&!origins.includes(origin))return reply(403,'Origem não permitida.');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,'Método inválido.');
 const token=req.headers.get('authorization');if(!token)return reply(401,'Entre na sua conta.');
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const scoped=createClient(url,anon,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await scoped.auth.getUser();if(authError||!user)return reply(401,'Sessão inválida.');
 const school=req.headers.get('x-school-id')||'',student=req.headers.get('x-student-id')||'';
 if(!/^[0-9a-f-]{36}$/i.test(school)||student&&!/^[0-9a-f-]{36}$/i.test(student))return reply(400,'Identificador inválido.');
 const {data:member}=await scoped.from('school_members').select('role').eq('school_id',school).eq('user_id',user.id).eq('active',true).single();
 if(!member||!['owner','admin',...(student?['staff']:[])].includes(member.role))return reply(403,'Sem permissão.');
 if(student){const {data}=await scoped.from('students').select('id').eq('school_id',school).eq('id',student).single();if(!data)return reply(404,'Aluno não encontrado.');}
 if(Number(req.headers.get('content-length')||'0')>max)return reply(413,'Limite de 2 MB.');
 try {
 const reader=req.body?.getReader();if(!reader)return reply(400,'Arquivo ausente.');let length=0;const parts:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();return reply(413,'Limite de 2 MB.');}parts.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const png=bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpeg=bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 const webp=bytes.length>=16&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 const type=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':'';if(!type||req.headers.get('content-type')?.split(';')[0]!==type)return reply(400,'Envie uma imagem PNG, JPEG ou WebP válida.');
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const path=`${school}/${crypto.randomUUID()}.${png?'png':jpeg?'jpg':'webp'}`;
 const {error}=await admin.storage.from('af-media').upload(path,bytes,{contentType:type,upsert:false});if(error)return reply(500,'Não foi possível salvar a imagem.');
 const update=student?await admin.from('students').update({photo_path:path}).eq('school_id',school).eq('id',student):await admin.from('schools').update({logo_url:path}).eq('id',school);
 if(update.error){await admin.storage.from('af-media').remove([path]);return reply(500,'Não foi possível vincular a imagem.');}
 return new Response(JSON.stringify({path}),{status:201,headers});
 }catch{return reply(500,'Falha ao processar o arquivo.');}
});
