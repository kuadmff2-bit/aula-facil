# Política de privacidade

**Versão:** 0.3.0  
**Última atualização:** 05 de setembro de 2026

Esta política descreve o tratamento de dados realizado pelo **AulaFácil Desktop e AulaFácil Cloud 0.3.x**, inclusive quando a instituição opta por usar sincronização online, pagamentos integrados e comunicações automatizadas.

## 1. Escopo e papéis

O AulaFácil é uma ferramenta de gestão destinada a instituições de ensino. Em regra, a instituição usuária define quais dados de alunos, responsáveis, colaboradores e demais titulares serão cadastrados, para quais finalidades serão utilizados e quem poderá acessá-los.

Quando o AulaFácil tratar dados pessoais em nome da instituição para prestar as funções contratadas ou habilitadas, o tratamento deverá seguir as instruções lícitas da instituição e a legislação aplicável. Quando houver finalidade própria do AulaFácil, ela será informada nesta política.

A instituição é responsável por possuir base legal adequada, limitar a coleta ao necessário e fornecer aos titulares as informações exigidas pela legislação, especialmente quando houver dados de crianças e adolescentes.

## 2. Dados que podem ser tratados

Conforme os módulos ativados e os campos definidos pela própria instituição, podem ser tratados:

- identificação e contato de alunos e responsáveis;
- data de nascimento e campos personalizados criados pela instituição;
- turma, curso, frequência, notas, conclusão e informações acadêmicas;
- informações de mensalidades, vencimentos, negociações, descontos, cobranças e pagamentos;
- registros de emissão de recibos, declarações, certificados e outros documentos;
- dados de conta e vínculo dos usuários autorizados da instituição;
- configurações de integrações e identificadores técnicos necessários ao funcionamento delas;
- registros técnicos de segurança, auditoria, sincronização e prevenção de falhas ou fraudes.

Credenciais secretas de provedores integrados não devem ser armazenadas em campos comuns de cadastros. Quando uma integração exigir segredo, o AulaFácil utiliza componentes de backend destinados a manter essas credenciais fora do aplicativo cliente.

## 3. Finalidades

Os dados podem ser tratados para:

- executar funções de gestão escolar, acadêmica e administrativa;
- controlar mensalidades, recebimentos, acordos e histórico financeiro;
- gerar documentos e comprovantes;
- autenticar usuários e aplicar permissões;
- sincronizar e recuperar dados em dispositivos autorizados;
- manter integridade, segurança, auditoria e rastreabilidade;
- criar e conciliar cobranças quando um provedor de pagamento for habilitado;
- enviar comunicações relacionadas à relação educacional quando a instituição ativar a integração correspondente;
- investigar erros, abuso, fraude, incidentes e tentativas de acesso indevido.

O AulaFácil não utiliza os cadastros escolares para publicidade comportamental e não vende dados pessoais.

## 4. Armazenamento local protegido

No aplicativo Windows, o banco local é armazenado na pasta de dados do AulaFácil em arquivo protegido. O conteúdo utiliza a **Data Protection API (DPAPI) do Windows**, por meio de mecanismos do sistema operacional destinados a vincular a descriptografia ao contexto de segurança do usuário do Windows.

O AulaFácil mantém controles de integridade e recuperação durante a gravação para reduzir o risco de perda causada por interrupções. Dados de versões antigas podem ser migrados do armazenamento legado para o armazenamento protegido; após migração confirmada, o registro legado pode ser removido.

A proteção local não elimina riscos decorrentes de dispositivo comprometido, malware ou acesso por pessoa que já tenha controle legítimo da sessão do Windows.

## 5. Backup portátil

Quando a instituição solicita um backup portátil na versão 0.3.x, o AulaFácil utiliza o formato protegido **.afbackup**, cuja abertura exige a senha definida pelo próprio usuário no momento da exportação.

A senha do backup não deve ser enviada ou armazenada junto do arquivo. Se ela for perdida, o AulaFácil não deve possuir uma chave-mestra para contornar a proteção do arquivo. A instituição é responsável pela guarda segura das cópias exportadas e respectivas senhas.

Backups JSON antigos de versões anteriores podem ser aceitos apenas para migração/restauração compatível, quando o aplicativo conseguir validar a estrutura. Esses arquivos legados não possuem a mesma proteção do formato .afbackup e devem ser tratados como confidenciais.

## 6. AulaFácil Cloud e sincronização

A utilização do AulaFácil Cloud é opcional para os recursos que não dependam de conta online. Quando a instituição ativa conta e sincronização, parte dos dados da instituição é transmitida por conexão criptografada e armazenada em infraestrutura online do serviço.

O acesso online é segmentado por instituição, conta e papel do usuário. O backend utiliza autenticação, políticas de autorização e **Row Level Security (RLS)** para reduzir o risco de acesso cruzado entre instituições.

A sincronização pode manter metadados técnicos de revisão e exclusão lógica para evitar que um dispositivo desatualizado recrie silenciosamente registros que já foram removidos ou substituídos.

## 7. Provedores e integrações

Conforme as funções habilitadas pela própria instituição, o AulaFácil pode utilizar ou se comunicar com prestadores como:

- **Supabase**, para autenticação, banco de dados, funções de backend e infraestrutura online;
- **Meta / WhatsApp Business Platform**, quando a instituição configurar mensagens oficiais;
- provedores de pagamento suportados pelo AulaFácil, como **Asaas**, e outros provedores que possam ser disponibilizados no produto;
- **Microsoft**, para distribuição do aplicativo e serviços relacionados à Microsoft Store quando aplicável.

Cada integração deve receber apenas os dados necessários para executar a operação solicitada. Os respectivos provedores também possuem termos e políticas próprios.

## 8. Pagamentos

Quando uma instituição habilita um provedor de pagamento, informações necessárias à criação, consulta e conciliação de uma cobrança podem ser transmitidas ao provedor escolhido. Isso pode incluir identificação do pagador, valor, vencimento, referência e identificadores da cobrança.

O AulaFácil não é instituição financeira e não deve armazenar no aplicativo cliente chaves administrativas secretas do provedor. Confirmações automáticas de pagamento dependem das respostas e regras do provedor integrado.

Registros financeiros confirmados podem ser preservados para histórico, auditoria, emissão de recibos, estornos ou outras obrigações legítimas, em vez de serem apagados silenciosamente.

## 9. WhatsApp e comunicações

Quando a instituição habilita automações pela WhatsApp Business Platform ou outro canal compatível, o AulaFácil pode tratar número de telefone, nome, referência de cobrança, valor, vencimento, frequência, falta ou outros campos necessários ao modelo de mensagem configurado.

A instituição é responsável por usar o canal de forma compatível com a legislação e as políticas do provedor, inclusive quanto a fundamento para contato, modelos aprovados, frequência e pedidos para interromper comunicações quando aplicável.

## 10. Crianças e adolescentes

O AulaFácil pode tratar dados de crianças e adolescentes quando esses dados forem inseridos por uma instituição para finalidade educacional ou administrativa legítima. A instituição deve observar as regras legais específicas, limitar o tratamento ao necessário e adotar cuidados proporcionais ao melhor interesse e à proteção desses titulares.

O AulaFácil não é destinado ao cadastro autônomo de crianças para fins de publicidade ou redes sociais.

## 11. Segurança

São adotadas medidas destinadas a reduzir riscos de acesso indevido, alteração, perda ou divulgação, incluindo, conforme o componente:

- proteção criptográfica do banco local pelo Windows;
- backup portátil protegido por senha;
- conexões HTTPS/TLS para serviços online;
- autenticação e controle de sessão;
- isolamento lógico por instituição;
- Row Level Security no banco online;
- segregação de credenciais privilegiadas e segredos de integrações;
- registros de auditoria de operações relevantes;
- validação de integridade e mecanismos de recuperação;
- controles de idempotência e reconciliação para operações financeiras e automações.

Nenhum mecanismo de segurança elimina completamente todos os riscos. A instituição deve manter o Windows atualizado, proteger os dispositivos, usar senhas fortes, restringir o acesso a pessoas autorizadas e revogar usuários que não devam mais ter acesso.

## 12. Usuários e permissões

A instituição pode conceder funções diferentes a usuários autorizados. Recursos administrativos, financeiros ou acadêmicos podem ser limitados conforme o papel atribuído.

A instituição é responsável por revisar seus usuários, remover acessos desnecessários e evitar o compartilhamento de contas. Operações relevantes podem ser registradas para auditoria e segurança.

## 13. Retenção, exclusão e histórico

Os dados são mantidos pelo período necessário à prestação do serviço, às finalidades informadas, à preservação legítima de histórico escolar/financeiro, à segurança ou ao cumprimento de obrigações aplicáveis.

Registros sincronizados podem utilizar exclusão lógica. Registros financeiros, de auditoria ou documentos emitidos podem exigir preservação de histórico e, quando adequado, ser cancelados, estornados ou substituídos por novos registros em vez de apagados sem rastreabilidade.

Quando tecnicamente e juridicamente possível, a instituição poderá solicitar ou executar exclusão/exportação dos dados sob sua responsabilidade. Determinados registros poderão permanecer pelo prazo necessário ao cumprimento de obrigação legal, prevenção de fraude, exercício regular de direitos ou segurança.

## 14. Direitos dos titulares

Solicitações referentes a dados cadastrados por uma instituição devem, em primeiro lugar, ser direcionadas à própria instituição responsável pela relação com o aluno, responsável ou colaborador. Quando a solicitação depender tecnicamente do AulaFácil, serão disponibilizados meios razoáveis para auxiliar a instituição no atendimento, observada a legislação aplicável.

## 15. Transferência e localização de dados

Prestadores de infraestrutura podem processar ou armazenar informações em regiões fora do município, estado ou país da instituição. Quando houver transferência internacional de dados pessoais, deverão ser observados os mecanismos e requisitos aplicáveis da legislação brasileira e as condições do prestador utilizado.

## 16. Incidentes

Quando houver incidente de segurança confirmado que possa acarretar risco ou dano relevante, serão adotadas medidas razoáveis de contenção, investigação e correção e, quando exigido, comunicação às partes e autoridades competentes nos termos da legislação aplicável.

## 17. Alterações desta política

Mudanças relevantes nesta política serão identificadas por nova versão. Quando necessário, o aplicativo poderá solicitar novo aceite dos usuários autorizados antes de continuar utilizando recursos online.

## 18. Contato

Os canais oficiais de suporte, privacidade e segurança são os informados no aplicativo e na página oficial do AulaFácil na Microsoft Store.

---

Esta política constitui a base operacional da versão 0.3.x. Por envolver tratamento de dados de menores, integrações financeiras e comunicações automatizadas, recomenda-se revisão jurídica brasileira antes de implantação comercial ampla.