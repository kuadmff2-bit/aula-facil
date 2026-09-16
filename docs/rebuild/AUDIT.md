# Auditoria e decisão de arquitetura

Base inspecionada: `fa051e5dda670d2f101d878727ac13d3feed27e5`, versão 0.4.17.

## Constatações verificadas

- `main.tsx` abria `AppNext` a partir do armazenamento local, sem gate obrigatório de autenticação.
- `storage.ts` armazenava a base operacional inteira no navegador e sincronizava snapshots.
- Frontend importava mais de dez folhas de estilo sobrepostas, incluindo correções sucessivas de contraste e overflow.
- A base PostgreSQL existente já tem isolamento por escola, pagamentos e integrações com provedores; não é necessário descartar dados.
- As políticas existentes permitiam que professores consultassem todos os alunos da escola e alterassem alunos/turmas.
- Clientes autenticados podiam inserir/alterar mensalidades diretamente, fora das novas operações transacionais.
- As migrations do repositório começam por alterações incrementais; NÃO representam um bootstrap completo de um projeto Supabase vazio.
- A consulta de segurança encontrou uma função de trigger executável por anon e proteção contra senhas vazadas desativada. A migration revoga EXECUTE da função. A configuração de Auth continua dependente do projeto/plano.
- Contagem antes dos testes: 1 escola, 5 alunos, 27 mensalidades. Nenhum registro foi removido ou alterado persistentemente durante os testes.

## Decisão

Manter React/TypeScript, adaptador de sessão nativa do Tauri, Supabase Auth e PostgreSQL existente. Substituir integralmente a entrada do frontend por `src/management/main.tsx`. Remover cópias operacionais locais, telas antigas, dependências não utilizadas e workflows antigos de patch.

A API de gestão usa RPCs PostgREST com validação e autorização no backend. Implementações privilegiadas ficam em `af_private`, fora dos schemas expostos, com search_path fixo e verificação de membro ativo. Wrappers públicos são SECURITY INVOKER e não têm permissão para anon. Não há credenciais administrativas no cliente.

A migration adiciona cursos, responsáveis, relações entre responsáveis e alunos, matrículas, recibos imutáveis, notificações lidas e histórico de cobranças. Mantém os IDs existentes e normaliza responsáveis/turmas antigas sem remover os campos originais. Não gera novas dívidas para matrículas antigas automaticamente.

## Limites da auditoria

A reconstrução não certifica as integrações de terceiros, o aplicativo mobile anterior, o Windows nativo ou conformidade jurídica com LGPD. Não houve teste real de envio de e-mail, pagamento em provedor, upload na função implantada ou navegação autenticada fim a fim. Não foi realizado pentest nem teste de carga.
