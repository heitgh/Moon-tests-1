# Changelog

## Unreleased — Personalização V2, Fase 1 (2026-08-25)

### Adicionado

- Central de personalização conectada à janela ativa, com preview, aplicar, cancelar, undo/redo e reset granular.
- Perfis globais ou por workspace para aparência, layout, Home, tipografia e pesquisa.
- Home configurável com grid, widgets, atalhos, cards e favoritos; toolbar reordenável por botões ou teclado.
- Temas salvos, migração de preferências V1, exportação e importação versionada.
- Persistência V2 coberta por testes de unidade, integração e reinício real do Electron.

### Segurança

- Importação rejeita versões, estruturas, URLs, cores e fontes inválidas antes de persistir.
- Wallpaper remoto é opt-in: somente HTTPS público, com redirects, MIME e tamanho limitados; a CSP do renderer continua sem acesso remoto direto.

## 0.1.0 — Foundation Recovery (2026-08-24)

### Adicionado

- CI determinístico com typecheck, lint, unit, integração, SQLite no Electron, E2E, audit e build.
- Application Service inicial conectado a TabManager, StateStore e EventBus.
- adapter `better-sqlite3`, migrations versionadas e repositories no processo principal.
- migração idempotente do perfil v1 com backup local e transação.
- restauração de abas não privadas após restart, coberta por E2E real.
- schema compartilhado e versionado de backup/importação.
- wallpapers locais, capturas atuais e ADRs de fundação.

### Alterado

- entrypoints, preload, workspaces npm e configuração de build foram unificados.
- shell foi separado em componentes de Home, toolbar, abas, workspaces e permissões.
- CSS foi separado em shell, Home, painéis, settings, responsividade e acessibilidade.
- flags de IA, extensões, Smart Spaces, Timeline e updater refletem o estado real: desativadas.

### Segurança

- CSP do renderer deixou de autorizar imagens e conexões HTTPS remotas por padrão.
- import/export passa por validação estrutural e limites antes de I/O.
- sessões privadas não são persistidas.

### Removido

- preloads e shell duplicados comprovadamente fora do runtime.
- CSS `preview-*` sem consumidor.
- wallpapers remotos carregados automaticamente.
