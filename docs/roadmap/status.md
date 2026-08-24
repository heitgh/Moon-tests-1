# Moon Browser — status de reconstrução

Atualizado em 24 de agosto de 2026. Este documento descreve somente capacidades conectadas ao runtime ativo.

## Moon Foundation Recovery

| Entrega | Estado | Evidência |
|---|---|---|
| Inventário e entrypoints reais | Concluído | `docs/audits/foundation-recovery-2026-08-24.md` |
| Main, preload e shell únicos | Concluído | `main.js` → main TS; `preload.cjs`; `ui/browser-shell.ts` |
| Build e workspaces coerentes | Concluído | `package.json`, `electron-builder.yml`, lockfile |
| CI install/type/lint/test/E2E/build/audit | Concluído | `.github/workflows/quality.yml` |
| ADRs obrigatórios | Concluído | `docs/adr/0001` a `0006` |
| Shell decomposto | Parcial avançado | Home, toolbar, tab strip, workspace bar, permissões e contratos separados; settings e alguns painéis ainda serão extraídos |
| CSS decomposto | Concluído para o runtime atual | globals é agregador; shell, Home, painéis, settings, responsive e accessibility separados |
| Application Service inicial | Concluído | `BrowserApplicationService` é a API usada pelo IPC de browser |
| Core conectado a tabs | Concluído | `TabManager`, `MoonStateStore` e `MoonEventBus` reconciliam eventos do browser real |
| Core conectado a workspaces/sessions/commands | Inicial | Instâncias compartilham EventBus/StateStore; migração do estado do renderer ainda não terminou |
| SQLite concreto no main | Concluído | better-sqlite3, WAL, foreign keys, busy timeout, migrations e contract tests no ABI Electron |
| Migração segura de localStorage | Concluído para o perfil v1 | schema compartilhado, backup de origem, transação, marker idempotente e fonte antiga preservada |
| Sessão restaurável | Concluído | abas não privadas e URLs voltam após restart; E2E executa dois ciclos Electron |
| Flags e documentação verdadeiras | Concluído | IA, extensões e updater permanecem desativados |
| Wallpapers locais e screenshots atuais | Concluído | assets locais, CSP sem imagens remotas automáticas e capturas do runtime |

## Quality gates atuais

- TypeScript estrito e ESLint.
- 14 testes unitários.
- 12 testes de integração do shell.
- 5 testes SQLite no runtime Electron.
- 2 E2E Electron: smoke de módulos e restore de sessão.
- Build Linux AppImage e deb; a validação final desta recuperação deve ser repetida após cada alteração de empacotamento.

## Dívida explícita antes das fases de produto

1. Extrair settings e renderizadores de bookmarks, history, notes, downloads e security do controlador do shell.
2. Mover workspaces, favoritos, histórico e notas do estado duplicado do renderer para APIs Application/repositories.
3. Persistir e revogar decisões de permissão por origem e instalar `setPermissionCheckHandler`.
4. Compor AdBlock e futuras políticas em um único pipeline `webRequest`.
5. Adicionar IPC schemas compartilhados a todos os canais e testes de sender/origin/limites.
6. Não ativar IA, extensões, updater ou VPN antes das definições de pronto registradas nos ADRs.

As fases de personalização Vivaldi-class, ergonomia, segurança avançada, Universal Search e Moon Intelligence permanecem planejadas, não implementadas.
