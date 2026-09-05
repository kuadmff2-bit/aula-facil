# AulaFácil Desktop

O **AulaFácil** é um sistema de gestão escolar para Windows, criado para funcionar de forma simples no dia a dia da instituição e continuar útil mesmo quando a internet não está disponível.

A linha **0.3.x** adiciona recursos profissionais sem abandonar a cópia local protegida: sincronização opcional entre dispositivos, financeiro com histórico de pagamentos, personalização da instituição, backups criptografados e integrações que podem ser habilitadas conforme a necessidade da escola.

## Principais recursos

- painel com alunos, turmas, presença e situação financeira;
- cadastro de alunos com campos personalizados e vencimento individual;
- turmas, horários, professores, mensalidades e carga horária;
- chamada e histórico de notas;
- geração mensal de cobranças respeitando o vencimento de cada aluno;
- multa, juros, desconto, negociação e histórico financeiro;
- registro de pagamentos e recibos em duas vias;
- declarações e certificados personalizáveis;
- identidade da instituição: nome, dados, logotipo e cores;
- modo claro, escuro ou seguindo o Windows;
- backup portátil protegido por senha no formato `.afbackup`;
- restauração validada de backups compatíveis de versões anteriores;
- conta e sincronização do AulaFácil Cloud opcionais;
- integrações financeiras e automações de mensagens configuráveis;
- suporte a Windows x64 e Windows ARM64.

A instalação começa **sem alunos ou dados de demonstração**.

## Segurança e dados

A cópia local do banco é protegida no Windows usando **DPAPI**. O backup portátil usa criptografia autenticada **AES-256-GCM** e exige a senha escolhida na exportação.

Quando o AulaFácil Cloud é ativado, o acesso online é separado por instituição e permissões de usuário. Credenciais administrativas de provedores de pagamento ou mensagens não devem ficar no frontend nem ser incluídas no repositório.

Nenhum software pode garantir risco zero. Por isso, o projeto mantém validação de dados, recuperação de gravação, backups, controle de acesso, RLS no backend e um portão automatizado de qualidade antes dos pacotes de lançamento.

Consulte a [Política de Privacidade](PRIVACY.md), os [Termos de Uso](TERMS_OF_USE.md), a [Política de Segurança](SECURITY.md) e o [Checklist de Lançamento](RELEASE_CHECKLIST.md).

## Microsoft Store

A distribuição principal para usuários finais é preparada para a Microsoft Store. O workflow
[`.github/workflows/build-store-msix.yml`](.github/workflows/build-store-msix.yml) compila e valida as arquiteturas **x64** e **ARM64**, cria os dois pacotes MSIX e os reúne em um único **MSIX Bundle**, acompanhado do hash SHA-256.

A identidade usada no pacote da Store deve ser exatamente a identidade atribuída ao produto no Partner Center. Alterar manualmente essa identidade quebra a associação com a publicação existente.

## Desenvolvimento

Pré-requisitos principais: Node.js 22, Rust estável e dependências de desenvolvimento do Tauri 2 para Windows.

```bash
npm ci
npm test
npm run build
npm run desktop:dev
```

Para validar o código nativo:

```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

O workflow **Validar qualidade do AulaFácil** executa testes, TypeScript/frontend e validação do Tauri em cada alteração relevante de desenvolvimento.

## Processo de lançamento

A branch `main` é tratada como estável. Mudanças maiores são concentradas na `develop` e somente devem chegar à versão publicada quando os testes e o checklist de lançamento estiverem concluídos.

Não é suficiente o aplicativo apenas compilar: a versão candidata também precisa validar migração e recuperação de dados, fluxos financeiros, autenticação/sincronização, instalação x64 e ARM64 e atualização sobre a versão anterior.

## Aplicativo para responsáveis e alunos

Uma aplicação móvel independente pode usar o mesmo backend autorizado do AulaFácil. Ela deve ser distribuída como aplicativo real no dispositivo, sem colocar chaves secretas de provedores dentro do APK.

## Tecnologia

- React
- TypeScript
- Vite
- Tauri 2
- Rust
- Supabase para os recursos opcionais de autenticação e nuvem

## Licença

Distribuído sob a [licença MIT](LICENSE).
