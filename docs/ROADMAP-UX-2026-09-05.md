# AulaFácil — solicitações e correções da rodada

Data: 05/09/2026

Este arquivo registra as mudanças pedidas durante os testes reais do aplicativo para evitar que qualquer solicitação se perca. Um item só deve ser marcado como concluído depois de implementado e validado na versão distribuível.

## Impressão, recibos e certificados

- [ ] Fazer o recibo aproveitar praticamente toda a folha A4, em vez de ficar concentrado no meio.
- [ ] Manter as duas vias (pagante e escola) em uma única folha A4 sempre que possível.
- [ ] Compactar automaticamente o conteúdo do recibo conforme a quantidade de informações, reduzindo espaços vazios sem sacrificar legibilidade.
- [ ] Garantir que nenhuma informação do recibo seja cortada ou passe para uma segunda folha indevidamente.
- [ ] Ao clicar em “Baixar PDF”, mostrar feedback muito claro de processamento e conclusão, informando que o arquivo foi baixado/gerado com sucesso.
- [ ] Garantir que certificado e recibo não travem durante geração de PDF.
- [ ] Garantir que certificado ocupe corretamente o papel escolhido, sem cortes.
- [ ] Permitir editar layout do certificado (papel, orientação, espaçamento e demais ajustes necessários para caber corretamente).
- [ ] Garantir que impressão e PDF usem uma página isolada, sem o restante do aplicativo interferir no layout.

## Alunos e WhatsApp

- [ ] Fazer o botão/ícone do WhatsApp no aluno realmente abrir a conversa com mensagem pronta.
- [ ] No Windows/Tauri, abrir links externos de WhatsApp de forma compatível com o aplicativo desktop, sem depender de `window.open` se ele for bloqueado.
- [ ] Manter a regra de destinatário: menor de 18 anos -> responsável; 18 anos ou mais -> próprio aluno.
- [ ] Exibir erro claro quando não houver telefone válido em vez de o botão parecer não fazer nada.

## Turmas

- [ ] Em cada turma específica, adicionar no canto um botão “Adicionar aluno”.
- [ ] Ao usar “Adicionar aluno” dentro da turma, abrir a matrícula com aquela turma já pré-selecionada.
- [ ] Preservar a visão de turma com curso, sala, professor, horário e lista dos alunos logo abaixo.

## Cadastro e validação de datas

- [ ] Corrigir o campo “Data de nascimento” para permitir editar e apagar partes normalmente, sem apagar o valor inteiro de forma inesperada.
- [ ] Continuar bloqueando datas futuras e datas inválidas apenas na validação, sem atrapalhar a digitação/edição do usuário.
- [ ] Só aplicar regras de menor/maior de idade quando a data de nascimento estiver completa e válida.
- [ ] Manter validação de telefone com DDD e quantidade válida de dígitos.

## Layout e usabilidade geral

- [ ] Reduzir botões e caixas excessivamente grandes nas áreas de Configurações, Pagamentos e Automações.
- [ ] Usar botões compactos com largura proporcional ao conteúdo, exceto ações principais que realmente precisem ocupar a linha.
- [ ] Corrigir textos que encostam ou quase saem das caixas/cards.
- [ ] Aplicar `min-width: 0`, quebra de linha e limites adequados de largura nos grids e cards para impedir vazamentos.
- [ ] Revisar toda a interface para evitar rolagem horizontal e comportamento de “site largo” dentro do aplicativo desktop.
- [ ] Manter boa legibilidade nos modos claro e escuro, com fundos suaves/cinzas e contraste suficiente.
- [ ] Permitir usar Esc para fechar/voltar em modais e janelas internas quando seguro.

## Cloud, pagamentos e cobranças

- [ ] Tornar claro na tela se o usuário está: logado, com instituição selecionada, sincronizado e apto a usar integrações.
- [ ] Se o usuário estiver logado mas sem instituição selecionada, mostrar ação direta para selecionar/criar a instituição em vez de apenas bloquear a seção.
- [ ] Explicar o fluxo de cobrança em linguagem simples dentro da própria tela.
- [ ] Deixar claro que mensalidades são registros internos e que Pix/boleto online precisam de uma conexão de pagamento ativa.
- [ ] Permitir Pix manual como opção simples sem exigir API bancária.
- [ ] Para Asaas/outro provedor: mostrar passo a passo “Adicionar conexão -> configurar credenciais -> definir como padrão -> gerar cobrança”.
- [ ] Exibir claramente quando uma conexão está pronta, pendente ou desativada.
- [ ] Garantir que a geração efetiva de cobrança online use a conexão selecionada e mostre Pix/boleto/link ao usuário.

## Automações de mensagens

- [ ] Tornar a tela de automações menos confusa e mais compacta.
- [ ] Mostrar um passo a passo visual: 1) instituição Cloud, 2) canal WhatsApp, 3) credenciais, 4) modelo, 5) regra/horário, 6) ativar.
- [ ] Se o usuário já estiver logado, identificar claramente por que a automação ainda está bloqueada (por exemplo: instituição não selecionada, canal sem credenciais ou template Meta não aprovado).
- [ ] Não mostrar apenas “conecte uma conta” quando já existe sessão autenticada; informar o requisito realmente ausente.
- [ ] Manter automações rodando no servidor mesmo com o computador desligado quando todos os requisitos estiverem configurados.
- [ ] Manter regra automática por idade e textos adaptados para aluno adulto ou responsável de menor.

## E-mail do AulaFácil Cloud

- [ ] Manter opção de reenviar confirmação e orientar Spam/Lixo eletrônico/Promoções.
- [ ] Detectar quando a conta já está confirmada e não prender o usuário esperando novo e-mail.
- [ ] Usar template visual do AulaFácil para confirmação de e-mail quando o provedor/SMTP estiver configurado.
- [ ] Para produção, configurar/usar SMTP apropriado para melhorar a entrega dos e-mails.

## Critério para encerrar esta rodada

- [ ] Testes automatizados verdes.
- [ ] TypeScript e frontend compilando sem erro.
- [ ] Tauri validado.
- [ ] Instaladores Windows x64 e ARM64 gerados.
- [ ] Teste real no Windows das áreas afetadas: recibo, certificado/PDF, WhatsApp, turmas, data de nascimento, Cloud, pagamentos e automações.
