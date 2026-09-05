# Política de privacidade

Esta política se aplica ao **AulaFácil Desktop 0.2.x**.

## Resumo

O AulaFácil Desktop 0.2.x funciona localmente no computador. Esta versão não possui conta online, publicidade, telemetria, análise de uso ou sincronização de cadastros com servidores do AulaFácil.

**Esta versão não transfere os cadastros da instituição para outros sistemas em rede, salvo quando uma ação ou integração futura for expressamente habilitada pelo próprio usuário.**

## Dados tratados

A instituição pode registrar informações relacionadas a alunos, responsáveis, turmas, frequência, notas, cobranças, recibos, comunicados e configurações do sistema.

A instituição usuária é responsável por definir quais informações deve coletar e por utilizar o AulaFácil de acordo com a legislação aplicável, especialmente quando houver dados pessoais de menores de idade.

## Armazenamento local protegido

No aplicativo Windows, o banco local é armazenado na pasta de dados do AulaFácil em um arquivo protegido. O conteúdo é criptografado utilizando a **Data Protection API (DPAPI) do Windows**, por meio de `CryptProtectData` e `CryptUnprotectData`.

Essa proteção vincula a descriptografia ao contexto de segurança do Windows utilizado pelo aplicativo. Copiar o arquivo protegido para outro usuário ou outro computador não o transforma automaticamente em um banco legível.

O AulaFácil também mantém uma cópia local de recuperação durante o processo de gravação para reduzir o risco de perda causado por interrupção durante a escrita do arquivo.

Cadastros de versões antigas que ainda estejam no armazenamento legado da WebView podem ser migrados automaticamente para o armazenamento protegido e, após uma migração bem-sucedida, o registro legado é removido.

## Backups exportados pelo usuário

Quando o usuário escolhe **Criar backup**, a versão 0.2.x exporta um arquivo JSON contendo os dados do sistema. Esse arquivo é criado somente por solicitação do usuário e deve ser tratado como informação confidencial.

O backup exportado atualmente **não possui a mesma proteção DPAPI do banco interno**, porque precisa poder ser selecionado posteriormente para restauração. Por isso, a instituição deve armazená-lo em local seguro, controlar quem possui acesso e evitar enviá-lo por canais públicos ou não confiáveis.

A restauração somente lê o arquivo que o próprio usuário selecionar e substitui o banco atual após confirmação.

## Controle e exclusão

- **Backup e dados > Criar backup** cria uma cópia dos dados para guarda da instituição.
- **Backup e dados > Restaurar backup** permite recuperar uma cópia previamente exportada.
- **Backup e dados > Limpar sistema** remove os registros locais após uma confirmação explícita.
- A desinstalação pode ser realizada pelas configurações de aplicativos do Windows ou pela Microsoft Store, conforme a forma de instalação.

A instituição não deve inserir senhas, tokens de API, chaves bancárias ou outros segredos em campos comuns destinados a alunos, responsáveis, avisos ou observações.

## Segurança

O AulaFácil utiliza controles locais destinados a reduzir o risco de acesso indevido e perda acidental, incluindo criptografia do banco interno, validação da estrutura dos dados e cópia de recuperação durante gravações.

Nenhum mecanismo de segurança elimina totalmente a possibilidade de falha, comprometimento do dispositivo ou acesso por uma pessoa que já possua controle legítimo da sessão do Windows. A instituição deve manter o Windows atualizado, utilizar senha ou PIN de acesso e restringir o uso do computador a pessoas autorizadas.

## Versões futuras com conta e sincronização

Uma versão futura que ofereça conta online, sincronização entre dispositivos, serviços de pagamento, WhatsApp, armazenamento em nuvem ou outras integrações terá esta Política de Privacidade atualizada **antes de ser distribuída com essas funcionalidades habilitadas**.

Essa futura versão deverá informar, entre outros pontos, quais dados são enviados, para quais finalidades, quais prestadores participam do tratamento, como funciona a retenção, como exercer direitos relativos aos dados e quais medidas de segurança são utilizadas.

## Contato e alterações

Alterações relevantes nesta política serão publicadas junto da versão do AulaFácil à qual se aplicam. Questões de segurança devem ser tratadas pelos canais informados em `SECURITY.md` no repositório oficial do projeto.
