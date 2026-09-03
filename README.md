# AulaFácil Desktop

Sistema local de gestão escolar do **Centro Educacional Shekinah**. A interface e os dados funcionam diretamente no computador, sem abrir site, navegador ou tela de login externa.

## O que esta versão entrega

- instalação nova completamente vazia, sem alunos, turmas ou cobranças de demonstração;
- painel com visão geral da escola;
- cadastro de alunos, responsáveis e turmas;
- chamada diária e registro de notas;
- criação de mensalidades individuais ou em lote;
- baixa de pagamentos e recibos imprimíveis;
- comunicados;
- declarações e comprovantes para impressão ou PDF;
- backup e restauração em arquivo JSON;
- funcionamento offline no Windows;
- instalador para Windows ARM64, incluindo o Galaxy Book Go;
- instalador para computadores Windows x64.

Os dados ficam somente no perfil do usuário do Windows. Esta versão não envia
cadastros, telemetria ou análises para a internet. Consulte a
[política de privacidade](PRIVACY.md) e faça backups frequentes pelo menu
**Backup e dados**.

## Baixar o instalador

1. Abra a página [Releases](https://github.com/kuadmff2-bit/aula-facil/releases/latest).
2. Em **Assets**, baixe:
   - `AulaFacil-Windows-ARM64-Setup.exe` para Galaxy Book Go e outros Windows ARM;
   - `AulaFacil-Windows-x64-Setup.exe` para a maioria dos computadores Intel e AMD.
3. Desinstale a versão 0.1.0, caso ela esteja instalada, e execute o novo instalador `.exe`.

Os instaladores 0.2.0 ainda não possuem assinatura digital. O Microsoft Defender
SmartScreen pode oferecer **Mais informações > Executar assim mesmo**, mas o
Controle Inteligente de Aplicativos (Smart App Control) pode bloquear o arquivo
sem mostrar essa opção. Não desative o antivírus nem o firewall. O projeto está
preparando distribuição assinada pela Microsoft Store e, como alternativa para
o instalador EXE direto, uma solicitação à SignPath Foundation. A situação atual
e o processo estão documentados na [política de assinatura](CODE_SIGNING.md).

Depois de baixar, compare o arquivo com `SHA256SUMS.txt` disponível na mesma
Release.

## Microsoft Store — instalação sem bloqueio

O caminho principal para eliminar o bloqueio sem comprar certificado será a
Microsoft Store. Contas individuais podem publicar sem taxa de cadastro e a
Microsoft assina gratuitamente pacotes MSIX aprovados pela certificação.

O workflow
[`.github/workflows/build-store-msix.yml`](.github/workflows/build-store-msix.yml)
já prepara um único pacote ARM64 + x64. A compilação padrão usa uma identidade
de teste apenas para validar o empacotamento. Antes do envio à Store, os três
valores de identidade devem ser copiados exatamente do Partner Center ao
executar o workflow manualmente.

Cadastro oficial: [Microsoft Store Developer](https://storedeveloper.microsoft.com/).

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

Responsáveis do projeto:

- autor, mantenedor, committer e revisor: [@kuadmff2-bit](https://github.com/kuadmff2-bit);
- aprovador manual das solicitações de assinatura: [@kuadmff2-bit](https://github.com/kuadmff2-bit).

Nenhuma assinatura é aprovada automaticamente. Consulte a
[política de assinatura completa](CODE_SIGNING.md), a
[política de segurança](SECURITY.md) e a [política de privacidade](PRIVACY.md).

## Desinstalação

Abra **Configurações do Windows > Aplicativos > Aplicativos instalados**, localize
**AulaFácil**, abra o menu de opções e selecione **Desinstalar**. Para apagar os
registros antes disso, use **Backup e dados > Limpar sistema** dentro do app.

## Desenvolvimento

Pré-requisitos: Node.js 22, Rust e as dependências do Tauri 2.

```bash
npm install
npm run desktop:dev
```

Para gerar o instalador localmente:

```bash
npm run desktop:build
```

## Aplicativo da família

O aplicativo Android para responsáveis e alunos será distribuído como APK com a interface instalada no próprio celular. Ele não abrirá um site. Somente a sincronização de mensalidades, a geração do Pix e a confirmação do pagamento precisarão de internet e de um servidor seguro; a chave secreta do provedor de pagamentos nunca deve ficar dentro do APK.

## Tecnologia

Este projeto usa React, TypeScript, Vite e [Tauri 2](https://v2.tauri.app/). A aplicação é empacotada com seus próprios arquivos e usa o componente de renderização do Windows apenas para exibir a interface local.

## Licença

Distribuído sob a [licença MIT](LICENSE).
