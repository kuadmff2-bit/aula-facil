-- A função pública já valida auth.uid() e a função do membro antes de excluir.
-- SECURITY DEFINER permite que ela resolva aliases mantidos em uma tabela sem políticas RLS de cliente.
alter function public.aulafacil_explicit_soft_delete(uuid, text, uuid[]) security definer;
revoke all on function public.aulafacil_explicit_soft_delete(uuid, text, uuid[]) from public;
grant execute on function public.aulafacil_explicit_soft_delete(uuid, text, uuid[]) to authenticated;
