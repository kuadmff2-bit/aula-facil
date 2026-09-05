# Checklist de lançamento do AulaFácil

Uma versão não deve ser enviada à Microsoft Store nem marcada como estável enquanto algum item crítico abaixo estiver pendente.

## 1. Build e versões

- [ ] `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` e `package-lock.json` usam a mesma versão.
- [ ] Workflow **Validar qualidade do AulaFácil** concluído com sucesso.
- [ ] Build Windows x64 concluído com sucesso.
- [ ] Build Windows ARM64 concluído com sucesso.
- [ ] Pacote MSIX Bundle da Microsoft Store concluído com sucesso.
- [ ] Aplicativo de produção abre sem janela de terminal.
- [ ] DevTools permanece desabilitado no build de produção.

## 2. Dados e recuperação

- [ ] Migração de dados de uma versão anterior testada com uma cópia realista.
- [ ] Banco local protegido abre normalmente após reiniciar o Windows.
- [ ] Interrupção durante gravação não destrói banco e a cópia de recuperação funciona.
- [ ] Backup exportado pode ser restaurado em uma instalação de teste.
- [ ] Arquivo inválido/corrompido não sobrescreve silenciosamente dados existentes.
- [ ] Operações destrutivas pedem confirmação clara.

## 3. Segurança

- [ ] Auditoria de segurança do Supabase sem alertas relevantes pendentes.
- [ ] RLS ativado e testado para todas as tabelas com dados de instituições.
- [ ] Teste confirma que usuário da Escola A não consegue ler nem alterar registros da Escola B.
- [ ] Chaves de serviço, tokens da Meta e segredos de pagamento não ficam no frontend nem no repositório.
- [ ] CSP do Tauri revisada.
- [ ] Sessões e permissões de usuário testadas.
- [ ] Logs não registram senhas, tokens, dados bancários completos ou conteúdo sensível desnecessário.

## 4. Login e sincronização (antes da versão online)

- [ ] Cadastro/login/recuperação de conta funcionando.
- [ ] Primeiro usuário consegue criar/vincular uma instituição por fluxo de backend controlado.
- [ ] Dados criados no computador A aparecem no computador B autorizado.
- [ ] Alterações offline entram em fila e sincronizam quando a conexão volta.
- [ ] Conflitos simultâneos são tratados sem perda silenciosa de informação.
- [ ] Interface mostra claramente: sincronizado, sincronizando, offline ou erro.
- [ ] Encerrar sessão remove dados/tokens de sessão adequadamente sem destruir os dados da instituição no servidor.

## 5. Financeiro

- [ ] Vencimento individual por aluno funciona em meses de 28, 29, 30 e 31 dias.
- [ ] Multa e juros são calculados separadamente do valor original.
- [ ] Desconto e negociação preservam a dívida original no histórico.
- [ ] Parcelamento soma exatamente o valor acordado, incluindo ajustes de centavos.
- [ ] Pagamento não pode ser confirmado duas vezes por evento duplicado de webhook.
- [ ] Estorno/reabertura cria histórico de auditoria.
- [ ] Recibo mostra valor e referência corretos.
- [ ] Recibo imprime duas vias: aluno e escola.
- [ ] Integração de pagamento é testada primeiro em ambiente de teste/sandbox quando disponível.

## 6. WhatsApp e automações

- [ ] Escola precisa ativar explicitamente a automação antes do primeiro envio.
- [ ] Número do destinatário é validado.
- [ ] Aluno menor pode direcionar cobrança ao responsável conforme configuração.
- [ ] Modelos de mensagem podem ser revisados antes da ativação.
- [ ] Reenvios e falhas não geram duplicação descontrolada.
- [ ] Histórico mostra sucesso/falha e horário do envio.
- [ ] Regras e templates exigidos pela Meta são respeitados quando a API oficial for usada.
- [ ] Existe forma de desativar imediatamente uma automação problemática.

## 7. Interface e experiência

- [ ] Nenhuma confirmação destrutiva importante usa `window.confirm`.
- [ ] Modo Claro funciona.
- [ ] Modo Escuro funciona em todas as telas e diálogos.
- [ ] Modo Seguir o Windows reage à mudança do sistema.
- [ ] Documentos permanecem com fundo adequado à impressão mesmo no modo escuro.
- [ ] Estados vazios, carregamento, offline e erros possuem mensagens compreensíveis.
- [ ] Botões críticos não permitem clique duplo durante operações em andamento.
- [ ] Formulários preservam dados digitados quando ocorre erro recuperável.
- [ ] Fluxos principais podem ser usados somente com teclado.
- [ ] Contraste e foco visual revisados.

## 8. Personalização

- [ ] Nome e logo da instituição aparecem sem referências fixas à Shekinah.
- [ ] Cores personalizadas não tornam textos ilegíveis.
- [ ] Campos do cadastro podem ser adicionados, reordenados, ocultados e condicionados sem apagar histórico antigo.
- [ ] Modelos de recibo, cobrança e certificado possuem pré-visualização antes de salvar.
- [ ] Certificado emitido preserva um snapshot do modelo usado na emissão.

## 9. Legal e privacidade

- [ ] Política de Privacidade descreve exatamente a versão que será publicada.
- [ ] Termos de Uso têm versão identificável.
- [ ] Aceite registra usuário, versão do termo, data e versão do aplicativo.
- [ ] Mudança material dos termos exige novo aceite.
- [ ] Política e Termos são revisados antes de habilitar nuvem, dados de menores, WhatsApp e pagamentos em produção.
- [ ] Canais de suporte, privacidade e segurança estão disponíveis.

## 10. Teste final de lançamento

- [ ] Instalação limpa em Windows x64.
- [ ] Instalação limpa em Windows ARM64.
- [ ] Atualização por cima da versão publicada anterior sem perda de dados.
- [ ] Cadastro de turma e aluno.
- [ ] Chamada e lançamento de nota.
- [ ] Geração, atraso, negociação e pagamento de mensalidade.
- [ ] Impressão de recibo e certificado.
- [ ] Backup + restauração.
- [ ] Fechar e reabrir aplicativo mantendo estado consistente.
- [ ] Teste em conexão lenta e sem internet.

Somente depois desta lista ser concluída a versão deve ser tratada como candidata a produção.
