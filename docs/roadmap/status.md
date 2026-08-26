# Moon Browser — status de reconstrução

Atualizado em 25 de agosto de 2026. Este documento descreve somente capacidades conectadas ao runtime ativo.

## Moon Foundation Recovery

| Entrega | Estado | Evidência |
|---|---|---|
| Inventário e entrypoints reais | Concluído | `docs/audits/foundation-recovery-2026-08-24.md` |
| Main, preload e shell únicos | Concluído | `main.js` → main TS; `preload.cjs`; `ui/browser-shell.ts` |
| Build e workspaces coerentes | Concluído | `package.json`, `electron-builder.yml`, lockfile |
| CI install/type/lint/test/E2E/build/audit | Concluído | `.github/workflows/quality.yml` |
| ADRs obrigatórios | Concluído | `docs/adr/0001` a `0006` |
| Shell decomposto | Parcial avançado | Home, toolbar, tab strip, workspace bar, permissões e contratos separados; painéis de produto ainda serão extraídos |
| CSS decomposto | Concluído para o runtime atual | globals é agregador; shell, Home, painéis, settings, responsive e accessibility separados |
| Application Service inicial | Concluído | `BrowserApplicationService` é a API usada pelo IPC de browser |
| Core conectado a tabs | Concluído | `TabManager`, `MoonStateStore` e `MoonEventBus` reconciliam eventos do browser real |
| Core conectado a workspaces/sessions/commands | Inicial | Instâncias compartilham EventBus/StateStore; migração do estado do renderer ainda não terminou |
| SQLite concreto no main | Concluído | better-sqlite3, WAL, foreign keys, busy timeout, migrations e contract tests no ABI Electron |
| Migração segura de localStorage | Concluído para o perfil v1 | schema compartilhado, backup de origem, transação, marker idempotente e fonte antiga preservada |
| Sessão restaurável | Concluído | abas não privadas e URLs voltam após restart; E2E executa dois ciclos Electron |
| Flags e documentação verdadeiras | Concluído | IA, extensões e updater permanecem desativados |
| Wallpapers locais e screenshots atuais | Concluído | assets locais, CSP sem imagens remotas automáticas e capturas do runtime |

## Personalização V2 — Fase 1

| Entrega | Estado | Evidência |
|---|---|---|
| Fonte de verdade versionada | Concluído | `ui/customization/customization-schema.ts` e `customization-store.ts` |
| Preview, aplicar, cancelar, undo/redo e reset granular | Concluído | Central ativa em `ui/customization/customization-center.ts` |
| Aparência, layout, Home, tipografia, pesquisa e escopo | Concluído | `customization-applier.ts`, Home e toolbar ativos |
| Temas salvos, migração V1 e import/export V2 | Concluído | schema validado, bridge desktop e E2E de reinício/importação |
| Wallpaper remoto opcional e seguro | Concluído | HTTPS restrito, destino público, tipo/tamanho validados e dados servidos pelo main; CSP continua restritiva |
| Capturas do runtime V2 | Concluído | `assets/screenshots/page.png` a `page2.png` |

## Quality gates atuais

- TypeScript estrito e ESLint.
- 22 testes unitários.
- 14 testes de integração do shell.
- 5 testes SQLite no runtime Electron.
- 4 E2E Electron: smoke, restore de sessão, persistência V2 e import/export da bridge desktop.
- Build Linux AppImage e deb; a validação final desta recuperação deve ser repetida após cada alteração de empacotamento.

## Dívida explícita antes das fases de produto

1. Extrair renderizadores de bookmarks, history, notes, downloads e security do controlador do shell.
2. Mover workspaces, favoritos, histórico e notas do estado duplicado do renderer para APIs Application/repositories.
3. Persistir e revogar decisões de permissão por origem e instalar `setPermissionCheckHandler`.
4. Compor AdBlock e futuras políticas em um único pipeline `webRequest`.
5. Adicionar IPC schemas compartilhados a todos os canais e testes de sender/origin/limites.
6. Não ativar IA, extensões, updater ou VPN antes das definições de pronto registradas nos ADRs.

A Fase 1 de personalização está conectada e coberta. Personalização profunda de abas/painéis, comandos em cadeia, gestos, configurações por site, Zen/Circadian avançado, ergonomia, segurança avançada, Universal Search e Moon Intelligence permanecem planejados, não implementados.
