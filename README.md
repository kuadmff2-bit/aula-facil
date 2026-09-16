# AulaFácil — Gestão educacional

Reconstrução do AulaFácil com React/TypeScript, autenticação Supabase e PostgreSQL. **Candidata em revisão; ainda não publicada em produção.** Leia os gates em [docs/rebuild/VALIDATION.md](docs/rebuild/VALIDATION.md).

## O que foi implementado

Login/cadastro/recuperação de conta, instituições, permissões, alunos, responsáveis compartilhados, cursos, turmas, matrículas com geração transacional de parcelas, mensalidades, pagamento parcial, idempotência, estorno manual, recibos, PIX estático, cobranças por WhatsApp revisadas pelo operador, inadimplentes, resumo financeiro, auditoria, configurações, temas claro/escuro e layout responsivo.

Os dados operacionais são consultados no banco. Nenhum cadastro ou pagamento é salvo em localStorage. Apenas a preferência de tema fica lá. Sessões usam o adaptador protegido do Tauri e sessionStorage no navegador. Não há pagamento offline nem confirmação automática de PIX estático.

## Arquitetura

- `src/management`: aplicação nova, componentes, páginas, tipos e cliente de dados.
- `src/secure-auth-storage.ts`: adaptador de sessão protegido existente.
- `supabase/migrations/20260915231400_management_rebuild.sql`: migração aditiva sobre o banco atual.
- `supabase/functions/af-upload`: upload autenticado de imagens para bucket privado.
- `tests/management`: testes de moeda/PIX e asserções SQL transacionais.
- `src-tauri`: empacotamento Windows existente; não recompilado nesta entrega.
- `mobile` e integrações antigas de provedores: preservados, sem alegação de compatibilidade validada com a nova interface.

RPCs: `af_list`, `af_save`, `af_enroll`, `af_pay`, `af_detail`, `af_dashboard`, `af_settings`, `af_action`. O schema `af_private` não deve ser exposto pelo Data API. Cada operação verifica associação ativa e papel. Foreign keys compostas impedem referências entre instituições.

## Desenvolvimento

Node.js 22 ou posterior:

```sh
npm ci
cp .env.example .env.local
# Configure URL e chave publicável de uma instância de homologação.
npm run dev
```

O projeto conserva os identificadores públicos do Supabase já usado pelo AulaFácil em `src/management/public-config.ts`; variáveis de ambiente substituem esses valores. Chave publicável não é segredo nem concede autorização. Nunca usar service_role/secret em variável VITE_.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Banco e migrations

**A migration exige a base AulaFácil existente.** As migrations históricas do repositório não criam sozinhas um banco vazio. Antes de preparar uma instância nova, obtenha e versione um baseline de esquema sem dados/segredos a partir da instância atual.

Na homologação, aplique a migration depois de revisar os dados e o backup. Execute as asserções SQL dentro de uma transação:

```sql
BEGIN;
-- conteúdo da migration em uma base que ainda não a recebeu
-- conteúdo de tests/management/database.sql
ROLLBACK;
```

O teste cria fixtures temporárias e alterna para o papel authenticated. Não remova o ROLLBACK para executar os testes. Nunca rodar reset do banco produtivo.

## Publicação e corte

1. Criar backup e validar restauração em homologação. Em cada desktop antigo, reconciliar antes eventuais registros ainda não sincronizados; o novo frontend não importa automaticamente cópias locais.
2. Aplicar a migration na homologação. Configurar Auth: domínio/redirects, SMTP, limite de tentativas, política de senha e proteção contra credenciais vazadas conforme suporte do plano.
3. Publicar `af-upload` com verificação de JWT e configurar `AF_ALLOWED_ORIGINS` somente com as origens necessárias. A função usa variáveis de servidor fornecidas pelo Supabase; segredos nunca entram no frontend.
4. Testar os fluxos de [VALIDATION.md](docs/rebuild/VALIDATION.md), especialmente login, recuperação, permissões, uploads, impressão e telas móveis.
5. Coordenar o corte de clientes antigos: a migration revoga gravação direta em invoices/payments. Aplicar a migration e publicar o frontend na mesma janela.
6. Hospedar `dist/` com HTTPS. Para Cloudflare Pages: build `npm run build`, saída `dist`. `_headers` define CSP, proteção de frames e cache; `_redirects` mantém retorno de autenticação na aplicação. Outros hosts precisam aplicar cabeçalhos equivalentes.
7. Publicar uma release Windows depois de validar o workflow Tauri/assinatura; nenhum instalador novo foi gerado aqui.

Sem alterações persistentes no banco de produção nesta branch. Não basta publicar o frontend antes da migration.

## Segurança

Sem anon nos endpoints de gestão. Banco com RLS, autenticação gerenciada, índices únicos para pagamentos/recibos, locks de mensalidade, valores NUMERIC no servidor e centavos inteiros na entrada do cliente. Escritas financeiras passam por rotinas transacionais. Recibos preservam snapshot; estorno preserva pagamento e histórico. CPF mascarado nas listagens.

Uploads limitados a 2 MB, assinatura e MIME PNG/JPEG/WebP, nomes aleatórios e bucket privado. URLs de leitura são temporárias. Validar o endpoint implantado antes do uso. Não há garantia de segurança absoluta; limites restantes estão documentados.

## Backup e recuperação

Preservar: banco (esquemas, dados e Auth), objetos do bucket privado, configuração Auth/redirects, origens e segredos das Edge Functions. Backups do banco não incluem automaticamente os bytes do Storage.

Use backups gerenciados/PITR conforme o plano ou dump PostgreSQL por conexão administrativa mantida somente no ambiente do operador. Criptografe e restrinja acesso aos arquivos; eles contêm dados pessoais. Nunca commitar backups.

Restaure primeiro numa instância isolada, restaure os objetos de Storage, configure segredos e Auth, compare contagem de alunos/mensalidades/pagamentos e saldos e teste acesso de duas instituições. Só então coordene a recuperação do serviço. Não reimporte JSON antigo do desktop por cima do livro financeiro atual.

## Estado da entrega

[Auditoria](docs/rebuild/AUDIT.md) · [Testes e pendências explícitas](docs/rebuild/VALIDATION.md).
