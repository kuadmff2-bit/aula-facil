# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

O caminho principal será a distribuição de um pacote MSIX pela Microsoft Store,
que assina o pacote depois da certificação. A SignPath Foundation permanece como
alternativa para assinar o instalador EXE distribuído diretamente pelo GitHub.
Até a aprovação em um desses canais e a publicação de uma nova versão, os
instaladores atuais permanecem **sem assinatura digital**.

## Responsáveis

| Papel | Responsável |
| --- | --- |
| Autor e mantenedor | [@kuadmff2-bit](https://github.com/kuadmff2-bit) |
| Committer e revisor | [@kuadmff2-bit](https://github.com/kuadmff2-bit) |
| Aprovador das solicitações de assinatura | [@kuadmff2-bit](https://github.com/kuadmff2-bit) |

O mantenedor deve usar autenticação multifator no GitHub e na SignPath. Nenhuma
solicitação de assinatura será aprovada automaticamente.

## Processo de compilação e assinatura

1. O código-fonte público é compilado em runners hospedados pelo GitHub Actions.
2. Os instaladores ARM64 e x64 são guardados como artifacts do workflow antes
   de qualquer assinatura.
3. Cada solicitação de assinatura deve estar vinculada ao commit e ao workflow
   que produziram o arquivo e ser aprovada manualmente pelo aprovador listado
   acima.
4. Depois da aprovação, apenas o arquivo retornado pela SignPath poderá ser
   publicado como instalador assinado.
5. A Release inclui hashes SHA-256 para permitir uma segunda verificação do
   download.

O workflow público está em
[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml).
A integração de assinatura será ativada somente depois que a SignPath fornecer
os identificadores do projeto, a política e o token de API. Isso evita um fluxo
quebrado ou uma falsa alegação de que os arquivos atuais já estão assinados.

O pacote para a Microsoft Store é gerado pelo workflow
[`.github/workflows/build-store-msix.yml`](.github/workflows/build-store-msix.yml).
A identidade definitiva do pacote deve ser obtida no Partner Center depois da
reserva do nome do aplicativo. O MSIX de teste produzido antes disso não deve ser
distribuído aos usuários.

## Metadados e privacidade

O nome e a versão assinados devem corresponder a `productName` e `version` em
[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json). O tratamento de dados
está descrito em [`PRIVACY.md`](PRIVACY.md).
