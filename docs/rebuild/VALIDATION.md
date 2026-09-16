# Verificação da reconstrução

## Executado

- `npm run lint`: passou no frontend novo e testes novos.
- `npm run typecheck`: passou.
- `npm test`: 16 testes de moeda, PIX, CRC16 e proteção de links/dados passaram após remoção do frontend legado.
- `npm run build`: passou.
- Antes da substituição, os 49 testes legados também passaram; não são apresentados como cobertura do frontend novo.
- Migration e `tests/management/database.sql` executados contra PostgreSQL 17 do projeto existente dentro de `BEGIN ... ROLLBACK`, sem gravar fixtures.
- Casos de banco: matrícula atômica, parcelas, fevereiro bissexto, precisão decimal, pagamento parcial, quitação, repetição idempotente, conflito de payload, recibos, estorno preservando recibo, CPF inválido, valor negativo, referência entre escolas bloqueada, consultas de outra conta bloqueadas, professor sem acesso financeiro e a alunos não atribuídos, ausência de sessão.
- Parte das asserções executa `SET LOCAL ROLE authenticated`, verificando privilégios reais de cliente e RLS, não apenas execução como administrador.

## Não executado / gates para produção

- O navegador remoto retornou `ERR_BLOCKED_BY_CLIENT` ao abrir a prévia local. Não houve inspeção visual nem teste interativo nos tamanhos 320, 375, 390, 430, 768, 1024, 1366 e 1920.
- Cadastro/login/logout/recuperação por e-mail, navegação autenticada, upload implantado e impressão/PDF ainda precisam de teste ponta a ponta em homologação.
- Não houve teste concorrente com múltiplas conexões reais, embora as operações usem locks transacionais e índices únicos.
- Atualização de 16/09/2026: migração aplicada após autorização, com cópia privada dos dados e verificações de preservação dos registros e valores das mensalidades. Testes transacionais repetidos após implantação passaram. Upload publicado para a origem do aplicativo Windows; teste autenticado de upload ainda pendente.
- A migration restringe gravação financeira de clientes antigos; coordenar atualização antes do corte.

## Recursos do pedido ainda incompletos

Esta é uma candidata de reconstrução, não o atendimento integral dos 51 grupos de requisitos:

- Renegociação não tem tela na nova interface; as rotinas existentes permanecem no banco.
- Relatórios têm resumo financeiro e exportação da página atual; exportações completas e filtros combinados por curso/turma faltam.
- Não há fluxo de anonimização LGPD, onboarding guiado completo ou gestão de sessões/dispositivos.
- Auth usa os limites do Supabase; CAPTCHA, proteção de senha vazada e limites adicionais não foram configurados.
- Fotos/logos têm implementação de upload privado; o endpoint e as origens precisam ser publicados/configurados e testados. A validação reconhece assinatura do arquivo, mas não faz decodificação/re-encoding completo da imagem.
- PWA tem manifest e abertura independente; instalação e ícones raster/maskable não foram validados. Nenhuma operação financeira offline.
- Professores são atribuídos por ID de conta; a UX de atribuição precisa evoluir.
- Cadastros não incluem todos os campos opcionais detalhados no pedido (por exemplo, sexo/complemento).
- Base de instalação do banco a partir de projeto vazio precisa de baseline versionado. A migration atual exige o esquema AulaFácil já existente.

Não promover a release enquanto os gates correspondentes ao uso real da instituição não forem resolvidos.
