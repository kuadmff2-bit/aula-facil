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

Os dados ficam somente no perfil do usuário do Windows. Faça backups frequentes pelo menu **Backup e dados**.

## Baixar o instalador

1. Abra a página [Releases](https://github.com/kuadmff2-bit/aula-facil/releases/latest).
2. Em **Assets**, baixe:
   - `AulaFacil-Windows-ARM64-Setup.exe` para Galaxy Book Go e outros Windows ARM;
   - `AulaFacil-Windows-x64-Setup.exe` para a maioria dos computadores Intel e AMD.
3. Desinstale a versão 0.1.0, caso ela esteja instalada, e execute o novo instalador `.exe`.

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

## Aplicativo da família

O aplicativo Android para responsáveis e alunos será distribuído como APK com a interface instalada no próprio celular. Ele não abrirá um site. Somente a sincronização de mensalidades, a geração do Pix e a confirmação do pagamento precisarão de internet e de um servidor seguro; a chave secreta do provedor de pagamentos nunca deve ficar dentro do APK.

## Tecnologia

Este projeto usa React, TypeScript, Vite e [Tauri 2](https://v2.tauri.app/). A aplicação é empacotada com seus próprios arquivos e usa o componente de renderização do Windows apenas para exibir a interface local.
