# Política de Privacidade — AulaFácil Cloud

**Versão:** 0.3.0-draft  
**Status:** rascunho para a futura versão com sincronização online. Esta política não substitui a política da versão 0.2.x atualmente publicada.

## 1. Escopo

Esta política descreve o tratamento de dados realizado quando a instituição opta por usar os recursos de conta, sincronização online, pagamentos e comunicações do AulaFácil Cloud.

O AulaFácil foi projetado para uso por instituições de ensino. A instituição usuária define quais dados de alunos, responsáveis, turmas e cobranças serão cadastrados e é responsável por possuir base legal e fornecer as informações necessárias aos titulares conforme a legislação aplicável.

## 2. Dados que podem ser tratados

Conforme os módulos ativados e os campos definidos pela própria instituição, podem ser tratados:

- dados de identificação e contato de alunos e responsáveis;
- data de nascimento e informações acadêmicas;
- turma, curso, frequência, notas e conclusão;
- informações financeiras de mensalidades, acordos, descontos e pagamentos;
- documentos e campos personalizados criados pela instituição;
- registros de emissão de recibos, declarações e certificados;
- dados de conta dos usuários autorizados da instituição;
- registros técnicos de segurança, auditoria e sincronização necessários à operação do serviço.

O AulaFácil não exige que a instituição cadastre informações além das necessárias à sua finalidade. Campos adicionais devem ser criados e utilizados pela instituição de forma compatível com a legislação aplicável.

## 3. Finalidades

Os dados são tratados para permitir gestão escolar, controle acadêmico, cobrança e conciliação financeira, emissão de documentos, autenticação, recuperação em outros dispositivos autorizados, sincronização, segurança, prevenção de fraudes, auditoria e, quando configurado, envio de comunicações relacionadas à relação educacional.

## 4. Armazenamento local e online

No Windows, o AulaFácil mantém uma cópia local protegida para permitir desempenho e continuidade de uso. Informações locais sensíveis e a sessão de autenticação utilizam mecanismos de proteção fornecidos pelo Windows.

Quando o AulaFácil Cloud é ativado, dados da instituição também podem ser armazenados em infraestrutura online contratada pelo serviço. O acesso é segmentado por instituição e protegido por autenticação, regras de autorização e políticas de segurança no banco de dados.

## 5. Provedores e integrações

Para fornecer determinadas funções, o AulaFácil pode utilizar prestadores de infraestrutura e integrações configuradas pela instituição, incluindo, conforme o caso:

- Supabase, para autenticação, banco de dados e infraestrutura de backend;
- provedores de pagamento, como Asaas, quando a instituição ativar cobrança integrada;
- Meta/WhatsApp Business Platform, quando a instituição ativar mensagens oficiais;
- outros prestadores que venham a ser adicionados e sejam necessários à função escolhida pela instituição.

Cada integração somente deve receber os dados necessários para executar a operação solicitada. Credenciais secretas de integrações devem permanecer no backend seguro e não no banco de dados acessível pelo aplicativo cliente.

## 6. Compartilhamento

O AulaFácil não vende dados pessoais. Dados podem ser disponibilizados a prestadores necessários ao funcionamento do serviço, às integrações ativadas pela instituição ou quando houver obrigação legal, regulatória ou ordem válida de autoridade competente.

## 7. Segurança

São adotadas medidas destinadas a reduzir riscos de acesso indevido, perda, alteração ou divulgação, incluindo, conforme o componente:

- criptografia/proteção local fornecida pelo Windows;
- conexões criptografadas em trânsito;
- autenticação e controle de sessão;
- isolamento lógico dos registros por instituição;
- Row Level Security no banco online;
- segregação de credenciais privilegiadas;
- registros de auditoria para operações relevantes;
- controles de integridade, backup e recuperação;
- processamento idempotente de eventos de integrações financeiras e de comunicação.

Nenhum sistema conectado à internet pode ser considerado absolutamente imune a incidentes. Controles são revisados e atualizados para reduzir os riscos de forma proporcional à evolução do produto.

## 8. Usuários e permissões

A instituição poderá conceder acessos diferentes a usuários autorizados. Funções financeiras ou administrativas podem ser restritas conforme o papel do usuário. A instituição é responsável por manter seus usuários atualizados, remover acessos que não sejam mais necessários e proteger suas credenciais.

## 9. Retenção, exclusão e backups

Os dados são mantidos enquanto necessários para a prestação do serviço, para as finalidades informadas, para preservação de histórico escolar/financeiro legítimo ou para cumprimento de obrigações aplicáveis.

A exclusão lógica pode ser utilizada em registros sincronizados para impedir que um dispositivo antigo recrie dados já removidos. Registros financeiros e de auditoria podem exigir preservação de histórico e, quando aplicável, devem ser anulados ou estornados por registros compensatórios em vez de apagados silenciosamente.

Backups gerados pela própria instituição ficam sob a guarda de quem os exportou. A instituição deve protegê-los contra acesso indevido.

## 10. Crianças e adolescentes

Instituições que tratem dados de crianças e adolescentes devem observar as regras legais específicas aplicáveis e limitar a coleta ao necessário para a finalidade educacional e administrativa correspondente.

## 11. Comunicações por WhatsApp e outros canais

Mensagens automáticas só devem ser ativadas pela instituição quando houver fundamento adequado para o contato e respeito às regras do canal utilizado. A instituição controla os destinatários, modelos e automações habilitadas. Integrações oficiais podem exigir modelos previamente aprovados pelo provedor.

## 12. Pagamentos

Quando a instituição utilizar um provedor de pagamento, dados necessários à criação, consulta e conciliação de cobranças podem ser transmitidos ao provedor escolhido. O AulaFácil não deve armazenar no aplicativo cliente chaves secretas administrativas do provedor.

## 13. Direitos dos titulares

Solicitações relacionadas a dados cadastrados por uma instituição devem, em primeiro lugar, ser direcionadas à própria instituição responsável pela relação com o aluno ou responsável. Quando a solicitação depender tecnicamente do AulaFácil, serão disponibilizados meios razoáveis de suporte à instituição para atendê-la.

## 14. Alterações desta política

Mudanças relevantes serão identificadas por nova versão da política. Quando necessário, o aplicativo poderá solicitar novo aceite dos usuários autorizados antes de continuar utilizando funções online.

## 15. Contato

O canal oficial de contato e suporte será o informado na página do AulaFácil na Microsoft Store ou no próprio aplicativo na versão publicada.

---

Este documento é um rascunho técnico-operacional para a futura versão em nuvem e deve passar por revisão jurídica antes de uma implantação comercial ampla ou de mudanças relevantes no modelo de negócio.
