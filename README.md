# AulaFácil Desktop

Aplicativo leve para usar o **AulaFácil — Centro Educacional Shekinah** como um programa do Windows.

## O que esta versão entrega

- janela própria, com nome e ícone do AulaFácil;
- os mesmos dados do sistema online, sem duplicar cadastros;
- instalador nativo para Windows ARM64, incluindo o Galaxy Book Go;
- instalador para computadores Windows x64;
- atualização imediata da interface: melhorias publicadas no sistema online aparecem no aplicativo sem reinstalação.

> O aplicativo precisa de internet, pois trabalha com a base de dados segura do sistema online.

## Baixar o instalador

1. Abra a página [Releases](https://github.com/kuadmff2-bit/aula-facil/releases/latest).
2. Em **Assets**, baixe:
   - `AulaFacil-Windows-ARM64-Setup.exe` para Galaxy Book Go e outros Windows ARM;
   - `AulaFacil-Windows-x64-Setup.exe` para a maioria dos computadores Intel e AMD.
3. Execute o instalador `.exe`.

O Windows pode exibir o aviso "O Windows protegeu o computador" porque o instalador ainda não possui assinatura digital paga. Nesse caso, confira se o arquivo veio deste repositório, escolha **Mais informações** e depois **Executar assim mesmo**.

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

## Tecnologia

Este projeto usa [Tauri 2](https://v2.tauri.app/), que aproveita o WebView do próprio Windows para manter o aplicativo pequeno e econômico em memória.
