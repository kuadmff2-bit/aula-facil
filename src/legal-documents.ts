export type LegalDocumentType = "terms" | "privacy";

export type LegalDocument = {
  type: LegalDocumentType;
  title: string;
  version: string;
  text: string;
};

export const TERMS_DOCUMENT: LegalDocument = {
  type: "terms",
  title: "Termos de Uso — AulaFácil Cloud",
  version: "0.3.0-draft",
  text: `Termos de Uso — AulaFácil Cloud
Versão 0.3.0-draft

1. Finalidade do serviço
O AulaFácil é uma ferramenta de apoio à gestão escolar. O sistema pode oferecer cadastro de alunos e responsáveis, turmas, frequência, notas, mensalidades, negociações, recibos, documentos, certificados, contas de usuários, sincronização entre dispositivos e integrações opcionais com serviços de terceiros. O AulaFácil não substitui a responsabilidade administrativa, pedagógica, contábil, fiscal, jurídica ou regulatória da instituição usuária.

2. Responsabilidade pela instituição e pelos dados cadastrados
A instituição é responsável por possuir autorização, fundamento jurídico ou outra base adequada para os dados que decidir cadastrar; manter os dados corretos e necessários; conceder acesso somente a pessoas autorizadas; remover acessos quando deixarem de ser necessários; revisar valores, vencimentos, descontos, juros, acordos e documentos antes de sua formalização; e cumprir as obrigações aplicáveis à sua atividade.

3. Conta e credenciais
Cada usuário deve utilizar suas próprias credenciais e mantê-las protegidas. O compartilhamento indevido de conta pode comprometer a rastreabilidade das operações. O sistema pode registrar data, usuário, instituição e ação em operações relevantes para fins de segurança e auditoria.

4. Permissões
A instituição poderá possuir usuários com diferentes funções e níveis de acesso. A disponibilidade técnica de uma função não dispensa a instituição de definir internamente quem pode executar operações acadêmicas, administrativas ou financeiras.

5. Operações financeiras
O AulaFácil pode calcular mensalidades, multa, juros, descontos e negociações com base nas regras configuradas pela instituição. A instituição deve revisar as regras utilizadas e é responsável por sua conformidade com contratos e legislação aplicável. Pagamentos confirmados e recibos podem utilizar histórico imutável ou registros de estorno para preservar a auditoria.

6. Integrações de pagamento
Quando a instituição conectar um provedor de pagamento, a liquidação, Pix, boleto, cartão, tarifas, estornos e demais serviços externos dependem também das regras e disponibilidade do respectivo provedor. O AulaFácil não é banco, instituição de pagamento nem adquirente.

7. WhatsApp e comunicações automáticas
A instituição é responsável por selecionar destinatários, habilitar automações, manter dados de contato corretos e utilizar mensagens compatíveis com a finalidade da relação educacional. O envio também está sujeito aos termos, limites e disponibilidade do provedor utilizado.

8. Sincronização e modo offline
A sincronização depende de conexão, autenticação válida e disponibilidade dos serviços online. Algumas funções podem continuar disponíveis localmente durante interrupções e dados criados offline podem aguardar conexão para serem enviados. A instituição deve manter práticas adequadas de backup, especialmente antes de restaurações, importações ou mudanças administrativas relevantes.

9. Serviços de terceiros
Algumas funções podem depender de infraestrutura, autenticação, pagamentos ou comunicação fornecidos por terceiros. Falhas, indisponibilidade, suspensão de conta, limites ou mudanças de política desses serviços podem afetar funções integradas do AulaFácil.

10. Disponibilidade e manutenção
Nenhum software, dispositivo, rede ou serviço conectado pode ser garantido como absolutamente livre de defeitos, interrupções ou incidentes. Atualizações podem ser realizadas para segurança, compatibilidade, correção de falhas ou melhoria do serviço.

11. Uso proibido
É proibido acessar dados de outra instituição sem autorização, contornar controles de segurança, inserir software malicioso, explorar vulnerabilidades, utilizar integrações para spam, fraude ou assédio, tratar dados de forma manifestamente incompatível com a legislação ou falsificar pagamentos, recibos, certificados, auditorias ou identidades.

12. Backups e exportações
Arquivos exportados ou backups passam a ficar sob a guarda de quem realizou a exportação e devem ser armazenados de forma segura.

13. Segurança e incidentes
O AulaFácil utiliza controles técnicos destinados a reduzir riscos de acesso indevido, corrupção e perda de dados. Ao identificar comportamento suspeito, vulnerabilidade ou possível incidente, a instituição deve interromper a ação de risco e comunicar o problema pelos canais oficiais.

14. Limitação de responsabilidade
Na máxima extensão permitida pela legislação aplicável, não haverá responsabilidade por prejuízos decorrentes exclusivamente de configuração incorreta da instituição, uso indevido por usuário autorizado, perda de credenciais, equipamento comprometido, conexão indisponível ou falha de terceiro fora do controle razoável do AulaFácil. Esta cláusula não exclui responsabilidades que a legislação determine como irrenunciáveis.

15. Alterações e novas versões
Estes Termos podem ser atualizados quando houver mudança relevante no produto, integrações, modelo de operação ou legislação aplicável. Uma nova versão poderá exigir novo aceite no aplicativo.

16. Encerramento de conta e dados
A instituição poderá solicitar encerramento de conta conforme os procedimentos disponibilizados. A exclusão de dados observará obrigações de retenção aplicáveis, registros financeiros, auditoria e limitações técnicas legítimas de backup e recuperação.

17. Legislação aplicável
A utilização do AulaFácil deve observar a legislação brasileira aplicável, sem prejuízo de normas específicas da atividade da instituição usuária.

18. Aceite
O aplicativo poderá registrar a versão destes Termos, a versão da Política de Privacidade, a conta autenticada, a instituição relacionada, a versão do aplicativo, o hash do documento e a data do aceite para preservar evidência da concordância apresentada ao usuário.

Este documento é um rascunho técnico-operacional e deve passar por revisão jurídica antes de uma comercialização ampla ou de situações jurídicas específicas.`,
};

export const PRIVACY_DOCUMENT: LegalDocument = {
  type: "privacy",
  title: "Política de Privacidade — AulaFácil Cloud",
  version: "0.3.0-draft",
  text: `Política de Privacidade — AulaFácil Cloud
Versão 0.3.0-draft

1. Escopo
Esta política descreve o tratamento de dados quando a instituição utiliza recursos de conta, sincronização online, pagamentos e comunicações do AulaFácil Cloud. A instituição define quais dados de alunos, responsáveis, turmas e cobranças serão cadastrados e deve possuir fundamento adequado para esse tratamento.

2. Dados que podem ser tratados
Conforme os módulos ativados e campos definidos pela instituição, podem ser tratados dados de identificação e contato, data de nascimento, informações acadêmicas, turma, curso, frequência, notas, conclusão, mensalidades, acordos, descontos, pagamentos, documentos, campos personalizados, recibos, certificados, usuários autorizados e registros técnicos de segurança, auditoria e sincronização.

3. Finalidades
Os dados são tratados para gestão escolar, controle acadêmico, cobrança e conciliação financeira, emissão de documentos, autenticação, recuperação em outros dispositivos autorizados, sincronização, segurança, prevenção de fraudes, auditoria e comunicações relacionadas à relação educacional quando configuradas pela instituição.

4. Armazenamento local e online
No Windows, o AulaFácil mantém uma cópia local protegida para desempenho e continuidade de uso. Quando o AulaFácil Cloud é ativado, dados autorizados também podem ser armazenados em infraestrutura online. O acesso é segmentado por instituição e protegido por autenticação, autorização e políticas de segurança no banco de dados.

5. Provedores e integrações
O AulaFácil pode utilizar Supabase para autenticação, banco de dados e backend; provedores de pagamento, como Asaas, quando ativados; Meta/WhatsApp Business Platform, quando ativada; e outros prestadores necessários à função escolhida pela instituição. Cada integração deve receber somente os dados necessários para executar a operação solicitada. Credenciais secretas de integrações permanecem no backend e não no cliente.

6. Compartilhamento
O AulaFácil não vende dados pessoais. Dados podem ser disponibilizados a prestadores necessários ao funcionamento do serviço, às integrações ativadas pela instituição ou quando houver obrigação legal, regulatória ou ordem válida de autoridade competente.

7. Segurança
São adotadas medidas destinadas a reduzir riscos de acesso indevido, perda, alteração ou divulgação, incluindo proteção local do Windows, conexões criptografadas em trânsito, autenticação, isolamento por instituição, Row Level Security, segregação de credenciais privilegiadas, registros de auditoria, controles de integridade e processamento idempotente de eventos. Nenhum sistema conectado à internet pode ser considerado absolutamente imune a incidentes.

8. Usuários e permissões
A instituição poderá conceder acessos diferentes a usuários autorizados. Funções financeiras ou administrativas podem ser restritas conforme o papel do usuário. A instituição deve manter seus usuários atualizados, remover acessos que não sejam mais necessários e proteger suas credenciais.

9. Retenção, exclusão e backups
Os dados são mantidos enquanto necessários à prestação do serviço, às finalidades informadas, à preservação legítima de histórico escolar ou financeiro ou ao cumprimento de obrigações aplicáveis. Registros financeiros e de auditoria podem exigir preservação de histórico e, quando aplicável, ser anulados ou estornados por registros compensatórios em vez de apagados silenciosamente.

10. Crianças e adolescentes
Instituições que tratem dados de crianças e adolescentes devem observar as regras legais específicas aplicáveis e limitar a coleta ao necessário para a finalidade educacional e administrativa correspondente.

11. Comunicações
Mensagens automáticas só devem ser ativadas quando houver fundamento adequado para o contato e respeito às regras do canal utilizado. A instituição controla destinatários, modelos e automações habilitadas.

12. Pagamentos
Quando a instituição utilizar um provedor de pagamento, dados necessários à criação, consulta e conciliação de cobranças podem ser transmitidos ao provedor escolhido. O AulaFácil não armazena no cliente chaves secretas administrativas do provedor.

13. Direitos dos titulares
Solicitações relacionadas a dados cadastrados por uma instituição devem ser direcionadas inicialmente à própria instituição responsável pela relação com o aluno ou responsável. Quando a solicitação depender tecnicamente do AulaFácil, serão disponibilizados meios razoáveis de suporte à instituição.

14. Alterações desta política
Mudanças relevantes serão identificadas por nova versão. Quando necessário, o aplicativo poderá solicitar novo aceite antes de continuar utilizando funções online.

15. Contato
O canal oficial de contato e suporte será o informado na página do AulaFácil na Microsoft Store ou no próprio aplicativo na versão publicada.

Este documento é um rascunho técnico-operacional para a futura versão em nuvem e deve passar por revisão jurídica antes de uma implantação comercial ampla ou de mudanças relevantes no modelo de negócio.`,
};

export const LEGAL_DOCUMENTS = [TERMS_DOCUMENT, PRIVACY_DOCUMENT] as const;
