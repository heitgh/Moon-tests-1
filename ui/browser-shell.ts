import { MoonApp } from "./app/app.js";
import { resolveNavigationInput } from "./browser/navigation-input.js";
import {
  moonBrowserBridge,
  type AdblockStatus,
  type Drawer,
  type ManagedDownload,
  type Navigation,
  type PermissionRequest,
  type Preferences,
  type SavedLink,
  type SavedTheme,
  type SearchEngine,
  type Shortcut,
  type Tab,
  type TabUpdate,
  type Workspace
} from "./browser-shell/contracts.js";
import {
  ACCENTS,
  DEFAULT_PREFERENCES as DEFAULTS,
  DEFAULT_WORKSPACES as WORKSPACES,
  loadProfileValue as load,
  normalizePreferences,
  PROFILE_KEYS as KEYS,
  saveProfileValue as save,
  SEARCH_ENGINES as ENGINES,
  WALLPAPERS
} from "./browser-shell/profile.js";
import {
  button as btn,
  element as el,
  icon as svg,
  type IconName
} from "./browser-shell/dom.js";
import { HomeView } from "./browser-shell/components/home-view.js";
import { TabStrip } from "./browser-shell/components/tab-strip.js";
import { WorkspaceBar } from "./browser-shell/components/workspace-bar.js";
import { createPermissionPrompt } from "./browser-shell/components/permission-prompt.js";
import { Toolbar } from "./browser-shell/components/toolbar.js";
import { createMoonProfileBackup, parseMoonProfileBackup } from "../packages/storage/backup/profile-backup.js";

class BrowserShell {
  readonly #bridge = moonBrowserBridge();
  readonly #tabs = new Map<string, Tab>();
  readonly #navigation = new Map<string, Navigation>();
  readonly #tabStrip = new TabStrip({
    onActivate: tabId => { void this.#activate(tabId); },
    onClose: tabId => { void this.#close(tabId); }
  });
  readonly #toolbar = new Toolbar({
    onBack: () => { void this.#command("back"); },
    onForward: () => { void this.#command("forward"); },
    onReload: () => { void this.#refresh(); },
    onNavigate: value => { void this.#navigate(value); },
    onToggleBookmark: () => this.#toggleBookmark(),
    onOpenSecurity: () => this.#toggleDrawer("security"),
    onOpenAi: () => this.#toggleDrawer("ai")
  });
  readonly #omnibox = this.#toolbar.omnibox;
  readonly #homeView = new HomeView(value => { void this.#navigate(value); });
  readonly #home = this.#homeView.element;
  readonly #viewport = el("div", "moon-browser-viewport");
  readonly #drawer = el("aside", "moon-drawer");
  readonly #drawerBody = el("div", "moon-drawer-body");
  readonly #drawerTitle = el("h2", "moon-drawer-title", "Painel");
  readonly #workspaceBar = new WorkspaceBar({
    onSelect: workspaceId => { void this.#switchWorkspace(workspaceId); },
    onAdd: () => this.#addWorkspace()
  });
  readonly #back = this.#toolbar.back;
  readonly #forward = this.#toolbar.forward;
  readonly #reload = this.#toolbar.reload;
  readonly #bookmark = this.#toolbar.bookmark;
  readonly #securityPill = this.#toolbar.securityPill;
  readonly #securityText = this.#toolbar.securityText;
  readonly #status = el("div", "moon-status");
  readonly #rail = new Map<string, HTMLButtonElement>();
  #workspaces = load<Workspace[]>(KEYS.workspaces, [...WORKSPACES]);
  #bookmarks = load<SavedLink[]>(KEYS.bookmarks, []);
  #history = load<SavedLink[]>(KEYS.history, []);
  #downloads: readonly ManagedDownload[] = [];
  #notes = load<string>(KEYS.notes, "");
  #shortcuts = load<Shortcut[]>(KEYS.shortcuts, []);
  #themes = load<SavedTheme[]>(KEYS.themes, []);
  #adblock: AdblockStatus = { phase: "loading", enabled: true, blockedCount: 0 };
  #preferences = normalizePreferences(load<Partial<Preferences>>(KEYS.preferences, {}));
  #workspaceId = this.#workspaces[0]?.id ?? "research";
  #activeTabId: string | undefined;
  #openDrawer: Drawer | undefined;
  #settings: HTMLElement | undefined;
  #permissionPrompt: HTMLElement | undefined;
  #activePermission: PermissionRequest | undefined;
  readonly #permissionQueue: PermissionRequest[] = [];
  #resizeObserver: ResizeObserver | undefined;

  constructor(readonly container: HTMLElement) {}

  async start(): Promise<void> {
    this.#build(); this.#applyPreferences(); this.#bindShortcuts(); this.#observe(); this.#startClock();
    if (!this.#bridge) { this.#status.textContent = "Prévia da interface — use npm run dev:desktop para navegar."; return; }
    this.#bridge.onTabUpdated(update => this.#applyUpdate(update));
    this.#bridge.onTabClosed(({ tabId }) => { void this.#handleClosed(tabId); });
    this.#bridge.onDownloadsUpdated(downloads => { this.#downloads = downloads; this.#renderDrawer(); });
    this.#bridge.onAdblockStatus(status => { this.#adblock = status; this.#renderAdblock(); this.#renderDrawer(); });
    this.#bridge.onPermissionRequested(request => this.#enqueuePermissionPrompt(request));
    try {
      await this.#migrateLegacyProfile();
      this.#downloads = await this.#bridge.getDownloads();
      this.#adblock = await this.#bridge.getAdblockStatus();
      const preferredAdblock = load<boolean>(KEYS.adblock, true);
      if (this.#adblock.enabled !== preferredAdblock) {
        this.#adblock = await this.#bridge.setAdblockEnabled(preferredAdblock);
      }
      const tabs = await this.#bridge.getTabs();
      tabs.forEach(tab => this.#tabs.set(tab.id, tab));
      const active = tabs.find(tab => tab.active);
      this.#activeTabId = active?.id; this.#workspaceId = active?.workspaceId ?? this.#workspaceId;
      if (tabs.length === 0) await this.#createTab(); else this.#render();
    } catch (error) { this.#showError(error); }
  }

  #build(): void {
    const shell = el("div", "moon-browser-shell");
    const rail = el("aside", "moon-rail");
    const brand = btn("moon-brand", "Moon Browser", "moon"); brand.addEventListener("click", () => void this.#showHome()); rail.append(brand);
    const controls: readonly [string, string, IconName, () => void][] = [
      ["home", "Página inicial", "home", () => void this.#showHome()], ["workspaces", "Workspaces", "grid", () => this.#toggleDrawer("workspaces")],
      ["bookmarks", "Favoritos", "star", () => this.#toggleDrawer("bookmarks")], ["downloads", "Downloads", "download", () => this.#toggleDrawer("downloads")],
      ["history", "Histórico", "history", () => this.#toggleDrawer("history")], ["translate", "Traduzir página", "translate", () => this.#toggleDrawer("translate")],
      ["notes", "Bloco de notas", "note", () => this.#toggleDrawer("notes")], ["extensions", "Extensões", "plugin", () => this.#toggleDrawer("extensions")],
      ["ai", "Moon AI", "sparkles", () => this.#toggleDrawer("ai")]
    ];
    controls.forEach(([id, label, name, action]) => { const control = btn("moon-rail-button", label, name); control.addEventListener("click", action); this.#rail.set(id, control); rail.append(control); });
    rail.append(el("div", "moon-rail-spacer"));
    const settings = btn("moon-rail-button", "Configurações", "settings"); settings.addEventListener("click", () => void this.#openSettings()); this.#rail.set("settings", settings); rail.append(settings);

    const drawerHeader = el("header", "moon-drawer-header"); const drawerClose = btn("moon-icon-button", "Fechar painel", "close"); drawerClose.addEventListener("click", () => this.#closeDrawer());
    drawerHeader.append(this.#drawerTitle, drawerClose); this.#drawer.append(drawerHeader, this.#drawerBody);

    const main = el("section", "moon-browser-main"); const tabsBar = el("header", "moon-tabs-bar"); const mark = el("div", "moon-window-mark"); mark.append(svg("moon"), el("span", "", "MOON"));
    const addTab = btn("moon-add-tab", "Nova aba (Ctrl+T)", "plus"); addTab.addEventListener("click", () => void this.#createTab()); tabsBar.append(mark, this.#tabStrip.element, addTab);

    const content = el("div", "moon-content"); const stage = el("div", "moon-stage"); this.#renderHomeShortcuts(); stage.append(this.#home, this.#viewport, this.#status); content.append(stage);
    main.append(tabsBar, this.#toolbar.element, this.#workspaceBar.element, content); shell.append(rail, this.#drawer, main); this.container.replaceChildren(shell);
    this.#renderAdblock();
  }

  async #createTab(url?: string): Promise<void> { if (!this.#bridge) return; try { const tab = await this.#bridge.createTab(url, this.#workspaceId); this.#tabs.set(tab.id, tab); this.#activeTabId = tab.id; this.#render(); } catch (error) { this.#showError(error); } }
  async #activate(tabId: string): Promise<void> { if (!this.#bridge || !this.#tabs.has(tabId)) return; this.#activeTabId = tabId; for (const [id, tab] of this.#tabs) this.#tabs.set(id, { ...tab, active: id === tabId }); this.#render(); try { await this.#bridge.activateTab(tabId); } catch (error) { this.#showError(error); } }
  async #close(tabId: string): Promise<void> { if (!this.#bridge) return; try { await this.#bridge.closeTab(tabId); } catch (error) { this.#showError(error); } }
  async #handleClosed(tabId: string): Promise<void> { this.#tabs.delete(tabId); this.#navigation.delete(tabId); const tabs = this.#workspaceTabs(); const active = tabs.find(tab => tab.active) ?? tabs.at(-1); this.#activeTabId = active?.id; if (!active) await this.#createTab(); else await this.#activate(active.id); this.#renderDrawer(); }
  async #showHome(): Promise<void> { this.#closeDrawer(); if (!this.#bridge) return; if (!this.#activeTabId) return this.#createTab(); try { await this.#bridge.showHome(this.#activeTabId); } catch (error) { this.#showError(error); } }
  async #navigate(value: string): Promise<void> { if (!this.#bridge || !value.trim()) return; const url = this.#resolveInput(value); if (url === "moon://newtab") return this.#showHome(); this.#closeDrawer(); if (!this.#activeTabId) return this.#createTab(url); this.#status.textContent = ""; try { await this.#bridge.navigate(this.#activeTabId, url); } catch (error) { this.#showError(error); } }
  #resolveInput(value: string): string { const trimmed = value.trim(); const generic = resolveNavigationInput(trimmed); return generic.includes("duckduckgo.com/?q=") ? `${ENGINES[this.#preferences.searchEngine]}${encodeURIComponent(trimmed)}` : generic; }
  async #command(command: "back" | "forward"): Promise<void> { if (!this.#bridge || !this.#activeTabId) return; try { await this.#bridge[command](this.#activeTabId); } catch (error) { this.#showError(error); } }
  async #refresh(): Promise<void> { if (!this.#bridge || !this.#activeTabId) return; try { if (this.#tabs.get(this.#activeTabId)?.loading) await this.#bridge.stop(this.#activeTabId); else await this.#bridge.reload(this.#activeTabId); } catch (error) { this.#showError(error); } }

  #applyUpdate(update: TabUpdate): void {
    const previous = this.#tabs.get(update.tab.id); this.#tabs.set(update.tab.id, update.tab); this.#navigation.set(update.tab.id, update.navigation);
    if (update.tab.active) { this.#activeTabId = update.tab.id; this.#workspaceId = update.tab.workspaceId ?? this.#workspaceId; }
    if (previous?.loading && !update.tab.loading && this.#isWeb(update.tab.url)) this.#recordHistory(update.tab);
    if (update.error) this.#status.textContent = `Não foi possível abrir a página: ${update.error}`; this.#render(); this.#renderDrawer();
  }

  #render(): void {
    const active = this.#activeTabId ? this.#tabs.get(this.#activeTabId) : undefined; this.#renderTabs(); this.#renderWorkspaces(); const isHome = !active || active.url === "moon://newtab";
    this.#home.hidden = !isHome; this.#omnibox.value = isHome ? "" : active.url; const nav = active ? this.#navigation.get(active.id) : undefined; this.#back.disabled = !nav?.canGoBack; this.#forward.disabled = !nav?.canGoForward;
    this.#reload.replaceChildren(svg(active?.loading ? "stop" : "reload")); this.#reload.title = active?.loading ? "Parar" : "Recarregar";
    const saved = active ? this.#bookmarks.some(item => item.url === active.url) : false; this.#bookmark.classList.toggle("is-active", saved); this.#bookmark.title = saved ? "Remover dos favoritos" : "Adicionar aos favoritos";
    this.#rail.get("home")?.classList.toggle("is-active", isHome && !this.#openDrawer); requestAnimationFrame(() => this.#syncBounds());
  }

  #renderTabs(): void {
    this.#tabStrip.render(this.#workspaceTabs(), this.#activeTabId);
  }

  #renderWorkspaces(): void {
    this.#workspaceBar.render(this.#workspaces, [...this.#tabs.values()], this.#workspaceId);
  }
  #renderHomeShortcuts(): void {
    this.#homeView.renderShortcuts(this.#shortcuts);
  }
  async #switchWorkspace(id: string): Promise<void> { this.#workspaceId = id; const tabs = this.#workspaceTabs(); if (!tabs.length) await this.#createTab(); else await this.#activate(tabs.find(tab => tab.active)?.id ?? tabs[0]!.id); this.#renderDrawer(); }
  #addWorkspace(): void { const workspace = { id: `workspace-${Date.now()}`, name: `Espaço ${this.#workspaces.length + 1}` }; this.#workspaces = [...this.#workspaces, workspace]; save(KEYS.workspaces, this.#workspaces); void this.#switchWorkspace(workspace.id); }
  #workspaceTabs(): Tab[] { return [...this.#tabs.values()].filter(tab => (tab.workspaceId ?? "research") === this.#workspaceId); }

  #toggleBookmark(): void {
    const tab = this.#activeTabId ? this.#tabs.get(this.#activeTabId) : undefined; if (!tab || !this.#isWeb(tab.url)) { this.#flash("Abra um site para adicioná-lo aos favoritos."); return; }
    const found = this.#bookmarks.find(item => item.url === tab.url); if (found) { this.#bookmarks = this.#bookmarks.filter(item => item.id !== found.id); this.#flash("Removido dos favoritos."); } else { this.#bookmarks = [{ id: crypto.randomUUID(), title: tab.title || tab.url, url: tab.url, time: Date.now() }, ...this.#bookmarks]; this.#flash("Adicionado aos favoritos."); }
    save(KEYS.bookmarks, this.#bookmarks); this.#render(); this.#renderDrawer();
  }
  #recordHistory(tab: Tab): void { const latest = this.#history[0]; if (latest?.url === tab.url && Date.now() - latest.time < 30_000) return; this.#history = [{ id: crypto.randomUUID(), title: tab.title || tab.url, url: tab.url, time: Date.now() }, ...this.#history].slice(0, 500); save(KEYS.history, this.#history); }

  #toggleDrawer(name: Drawer): void { if (this.#openDrawer === name) return this.#closeDrawer(); this.#openDrawer = name; this.#drawer.classList.add("is-open"); this.#renderDrawer(); requestAnimationFrame(() => this.#syncBounds()); }
  #closeDrawer(): void { this.#openDrawer = undefined; this.#drawer.classList.remove("is-open"); this.#rail.forEach(item => item.classList.remove("is-active")); this.#render(); requestAnimationFrame(() => this.#syncBounds()); }
  #renderDrawer(): void {
    if (!this.#openDrawer) return; const titles: Readonly<Record<Drawer, string>> = { workspaces: "Workspaces", bookmarks: "Favoritos", downloads: "Downloads", history: "Histórico", translate: "Tradutor", notes: "Bloco de notas", extensions: "Extensões", ai: "Moon AI", security: "Proteção" };
    this.#drawerTitle.textContent = titles[this.#openDrawer]; this.#drawerBody.replaceChildren(); this.#rail.forEach(item => item.classList.remove("is-active")); this.#rail.get(this.#openDrawer)?.classList.add("is-active");
    if (this.#openDrawer === "workspaces") this.#workspaceDrawer(); if (this.#openDrawer === "bookmarks") this.#bookmarksDrawer(); if (this.#openDrawer === "downloads") this.#downloadsDrawer(); if (this.#openDrawer === "history") this.#historyDrawer(); if (this.#openDrawer === "translate") this.#translateDrawer(); if (this.#openDrawer === "notes") this.#notesDrawer(); if (this.#openDrawer === "extensions") this.#extensionsDrawer(); if (this.#openDrawer === "ai") this.#aiDrawer(); if (this.#openDrawer === "security") this.#securityDrawer();
  }
  #workspaceDrawer(): void {
    this.#drawerBody.append(el("p", "moon-drawer-description", "Separe abas e sessões por contexto.")); const list = el("div", "moon-panel-list");
    this.#workspaces.forEach(workspace => { const count = [...this.#tabs.values()].filter(tab => (tab.workspaceId ?? "research") === workspace.id).length; const wrapper = el("div", "moon-workspace-manage-row"); const row = btn(`moon-workspace-row${workspace.id === this.#workspaceId ? " is-active" : ""}`, `Abrir ${workspace.name}`); const copy = el("span", "moon-list-copy"); copy.append(el("strong", "", workspace.name), el("small", "", `${count} ${count === 1 ? "aba" : "abas"}`)); row.append(el("span", "moon-workspace-mark", workspace.name[0]?.toUpperCase()), copy, svg("chevron")); row.addEventListener("click", () => void this.#switchWorkspace(workspace.id)); wrapper.append(row); if (this.#workspaces.length > 1 && count === 0) { const remove = btn("moon-icon-button", `Excluir ${workspace.name}`, "trash"); remove.addEventListener("click", () => { this.#workspaces = this.#workspaces.filter(item => item.id !== workspace.id); if (this.#workspaceId === workspace.id) this.#workspaceId = this.#workspaces[0]!.id; save(KEYS.workspaces, this.#workspaces); this.#render(); this.#renderDrawer(); }); wrapper.append(remove); } list.append(wrapper); });
    const create = el("form", "moon-custom-form"); const name = el("input", "moon-settings-input"); name.placeholder = "Nome do workspace"; const add = btn("moon-primary-button", "Criar novo workspace", "plus"); add.append(el("span", "", "Criar")); create.append(name, add); create.addEventListener("submit", event => { event.preventDefault(); const value = name.value.trim(); if (!value) return; const workspace = { id: `workspace-${Date.now()}`, name: value }; this.#workspaces = [...this.#workspaces, workspace]; save(KEYS.workspaces, this.#workspaces); void this.#switchWorkspace(workspace.id); }); this.#drawerBody.append(list, create);
  }
  #bookmarksDrawer(): void {
    const summary = el("div", "moon-panel-summary"); summary.append(el("span", "", `${this.#bookmarks.length} salvos`)); const current = btn("moon-text-button", "Favoritar página atual", "star"); current.append(el("span", "", "Página atual")); current.addEventListener("click", () => this.#toggleBookmark()); summary.append(current); this.#drawerBody.append(summary);
    if (!this.#bookmarks.length) return this.#empty("star", "Nenhum favorito", "Use a estrela na barra de endereço para salvar um site."); const list = el("div", "moon-panel-list"); this.#bookmarks.forEach(item => list.append(this.#linkRow(item, () => { this.#bookmarks = this.#bookmarks.filter(saved => saved.id !== item.id); save(KEYS.bookmarks, this.#bookmarks); this.#renderDrawer(); this.#render(); }))); this.#drawerBody.append(list);
  }
  #historyDrawer(): void {
    const summary = el("div", "moon-panel-summary"); summary.append(el("span", "", `${this.#history.length} páginas`)); const clear = btn("moon-text-button is-danger", "Limpar histórico", "trash"); clear.append(el("span", "", "Limpar")); clear.disabled = !this.#history.length; clear.addEventListener("click", () => { this.#history = []; save(KEYS.history, this.#history); this.#renderDrawer(); }); summary.append(clear); this.#drawerBody.append(summary);
    if (!this.#history.length) return this.#empty("history", "Histórico vazio", "As páginas visitadas aparecerão aqui."); const list = el("div", "moon-panel-list"); this.#history.slice(0, 100).forEach(item => list.append(this.#linkRow(item, undefined, new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(item.time)))); this.#drawerBody.append(list);
  }
  #downloadsDrawer(): void {
    const summary = el("div", "moon-panel-summary");
    summary.append(el("span", "", `${this.#downloads.length} downloads`));
    const clear = btn("moon-text-button", "Limpar downloads finalizados", "trash");
    clear.append(el("span", "", "Limpar concluídos"));
    clear.disabled = !this.#downloads.some(item => ["completed", "cancelled", "failed"].includes(item.state));
    clear.addEventListener("click", () => void this.#bridge?.clearFinishedDownloads());
    summary.append(clear);
    this.#drawerBody.append(summary);
    if (!this.#downloads.length) return this.#empty("download", "Nenhum download", "Arquivos baixados pelos sites aparecerão aqui com progresso real.");
    const list = el("div", "moon-download-list");
    this.#downloads.forEach(download => {
      const row = el("article", "moon-download-row");
      const header = el("div", "moon-download-header");
      header.append(el("strong", "", download.filename), el("span", `moon-download-state is-${download.state}`, this.#downloadStateLabel(download.state)));
      const progress = el("progress", "moon-download-progress");
      progress.max = 100; progress.value = download.percentage ?? 0;
      const detail = el("div", "moon-download-detail", `${this.#bytes(download.receivedBytes)} / ${download.totalBytes > 0 ? this.#bytes(download.totalBytes) : "tamanho desconhecido"}`);
      const actions = el("div", "moon-download-actions");
      if (download.state === "in-progress") actions.append(this.#downloadAction("Pausar", "pause", () => void this.#bridge?.pauseDownload(download.id)));
      if (download.state === "paused") actions.append(this.#downloadAction("Continuar", "play", () => void this.#bridge?.resumeDownload(download.id)));
      if (["in-progress", "paused"].includes(download.state)) actions.append(this.#downloadAction("Cancelar", "close", () => void this.#bridge?.cancelDownload(download.id)));
      if (download.state === "completed") {
        actions.append(this.#downloadAction("Abrir", "play", () => void this.#bridge?.openDownload(download.id)));
        actions.append(this.#downloadAction("Pasta", "folder", () => void this.#bridge?.showDownloadInFolder(download.id)));
      }
      row.append(header, progress, detail, actions); list.append(row);
    });
    this.#drawerBody.append(list);
  }
  #translateDrawer(): void {
    const active = this.#activeTabId ? this.#tabs.get(this.#activeTabId) : undefined;
    const title = el("div", "moon-tool-hero"); title.append(svg("translate"), el("strong", "", "Traduzir página"));
    const language = el("select", "moon-select");
    [["pt", "Português"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["ja", "日本語"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value!; language.append(option); });
    const translate = btn("moon-primary-button", "Traduzir página atual", "translate"); translate.append(el("span", "", "Traduzir página atual")); translate.disabled = !active || !this.#isWeb(active.url);
    translate.addEventListener("click", () => { if (active && this.#isWeb(active.url)) void this.#navigate(`https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(language.value)}&u=${encodeURIComponent(active.url)}`); });
    this.#drawerBody.append(title, el("p", "moon-drawer-description", "A página será aberta pelo Google Translate no idioma escolhido."), language, translate);
  }
  #notesDrawer(): void {
    const title = el("div", "moon-tool-hero"); title.append(svg("note"), el("strong", "", "Anotações rápidas"));
    const textarea = el("textarea", "moon-notes-input"); textarea.value = this.#notes; textarea.placeholder = "Suas anotações ficam salvas localmente neste perfil do Moon."; textarea.rows = 14;
    const status = el("span", "moon-notes-status", "Salvo localmente");
    textarea.addEventListener("input", () => { this.#notes = textarea.value; save(KEYS.notes, this.#notes); status.textContent = "Salvo agora"; });
    this.#drawerBody.append(title, textarea, status);
  }
  #extensionsDrawer(): void {
    const title = el("div", "moon-tool-hero"); title.append(svg("plugin"), el("strong", "", "Extensões"));
    const card = el("div", "moon-info-card"); card.append(svg("shield"), el("p", "", "O runtime de extensões existe no Core, mas nenhuma extensão foi instalada neste perfil. O Moon não exibirá extensões fictícias como se estivessem ativas."));
    const compatibility = el("div", "moon-extension-status"); compatibility.append(el("strong", "", "Compatibilidade Chromium"), el("span", "", "Em desenvolvimento"));
    this.#drawerBody.append(title, card, compatibility);
  }
  #linkRow(item: SavedLink, remove?: () => void, meta?: string): HTMLElement { const row = el("div", "moon-link-row"); const open = btn("moon-link-main", `Abrir ${item.title}`); const copy = el("span", "moon-list-copy"); copy.append(el("strong", "", item.title), el("small", "", meta ?? this.#hostname(item.url))); open.append(el("span", "moon-site-mark", item.title[0]?.toUpperCase()), copy); open.addEventListener("click", () => void this.#navigate(item.url)); row.append(open); if (remove) { const removeButton = btn("moon-icon-button", `Remover ${item.title}`, "close"); removeButton.addEventListener("click", remove); row.append(removeButton); } return row; }
  #aiDrawer(): void {
    const hero = el("div", "moon-ai-hero"); hero.append(svg("sparkles"), el("strong", "", "Moon AI"), el("span", "moon-preview-badge", "PREVIEW"));
    const form = el("form", "moon-ai-form"); const input = el("textarea", "moon-ai-input"); input.placeholder = "O que você quer descobrir?"; input.rows = 5; const search = btn("moon-primary-button", "Pesquisar pergunta", "search"); search.append(el("span", "", "Pesquisar na web")); form.append(input, search); form.addEventListener("submit", event => { event.preventDefault(); void this.#navigate(input.value); });
    const info = el("div", "moon-info-card"); info.append(svg("sparkles"), el("p", "", "A conexão com um provedor de IA será feita no processo seguro, sem expor chaves na interface.")); this.#drawerBody.append(hero, el("p", "moon-drawer-description", "Nesta versão local, o Moon encaminha a pergunta ao motor de busca escolhido — sem fingir que já existe uma IA conectada."), form, info);
  }
  #securityDrawer(): void {
    const hero = el("div", "moon-security-hero"); hero.append(svg("shield"), el("strong", "", "Navegação isolada"), el("span", "", "ATIVA"));
    const adblock = el("div", "moon-adblock-control"); const copy = el("span", "moon-list-copy"); copy.append(el("strong", "", "Moon AdBlock"), el("small", "", this.#adblockDetail()));
    const toggle = btn(`moon-adblock-toggle${this.#adblock.enabled ? " is-active" : ""}`, this.#adblock.enabled ? "Desativar AdBlock" : "Ativar AdBlock"); toggle.append(el("span")); toggle.disabled = this.#adblock.phase === "loading" || this.#adblock.phase === "failed"; toggle.addEventListener("click", () => void this.#setAdblockEnabled(!this.#adblock.enabled)); adblock.append(copy, toggle);
    const list = el("div", "moon-security-list");
    [["Context isolation", "A página não acessa APIs internas do Moon."], ["Sandbox", "Sites executam em processos restritos do Chromium."], ["Navegação", "Somente HTTP e HTTPS são aceitos."], ["Workspaces", "Cada espaço usa uma sessão separada."]].forEach(([title, detail]) => { const item = el("div", "moon-security-item"); item.append(el("span", "moon-check", "✓"), el("strong", "", title), el("p", "", detail)); list.append(item); }); this.#drawerBody.append(hero, adblock, list);
  }
  #renderAdblock(): void { this.#securityPill.classList.toggle("is-disabled", this.#adblock.phase === "disabled" || this.#adblock.phase === "failed"); this.#securityPill.classList.toggle("is-loading", this.#adblock.phase === "loading"); this.#securityText.textContent = this.#adblock.phase === "loading" ? "AdBlock carregando" : this.#adblock.phase === "failed" ? "AdBlock indisponível" : this.#adblock.enabled ? `${this.#adblock.blockedCount} bloqueados` : "AdBlock desligado"; }
  async #setAdblockEnabled(enabled: boolean): Promise<void> { if (!this.#bridge) return; this.#adblock = await this.#bridge.setAdblockEnabled(enabled); save(KEYS.adblock, enabled); this.#renderAdblock(); this.#renderDrawer(); }
  #adblockDetail(): string { if (this.#adblock.phase === "loading") return "Carregando filtros reais…"; if (this.#adblock.phase === "failed") return `Falhou: ${this.#adblock.error ?? "erro desconhecido"}`; return this.#adblock.enabled ? `${this.#adblock.blockedCount} requisições bloqueadas nesta sessão` : "Proteção de anúncios desativada"; }
  #downloadAction(label: string, name: IconName, action: () => void): HTMLButtonElement { const actionButton = btn("moon-download-action", label, name); actionButton.append(el("span", "", label)); actionButton.addEventListener("click", action); return actionButton; }
  #downloadStateLabel(state: ManagedDownload["state"]): string { return ({ "in-progress": "Baixando", paused: "Pausado", completed: "Concluído", cancelled: "Cancelado", failed: "Falhou" })[state]; }
  #bytes(value: number): string { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`; return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`; }
  #empty(name: IconName, title: string, detail: string): void { const empty = el("div", "moon-empty"); empty.append(svg(name), el("strong", "", title), el("p", "", detail)); this.#drawerBody.append(empty); }

  async #openSettings(): Promise<void> {
    if (this.#settings) return; this.#closeDrawer(); if (this.#bridge) await this.#bridge.setContentVisible(false);
    const overlay = el("div", "moon-settings-overlay"); const modal = el("section", "moon-settings-modal"); modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); const sidebar = el("aside", "moon-settings-sidebar"); const brand = el("div", "moon-settings-brand"); brand.append(svg("moon"), el("span", "", "Moon")); sidebar.append(brand, el("h2", "", "Configurações")); const body = el("div", "moon-settings-body"); const pages = new Map<string, HTMLElement>();
    [["appearance", "Aparência", "palette"], ["search", "Pesquisa", "search"], ["home", "Página inicial", "home"], ["data", "Dados e backup", "download"]].forEach(([id, label, name], index) => { const nav = btn(`moon-settings-nav${index === 0 ? " is-active" : ""}`, label!, name as IconName); nav.append(el("span", "", label)); nav.addEventListener("click", () => { sidebar.querySelectorAll(".moon-settings-nav").forEach(item => item.classList.remove("is-active")); nav.classList.add("is-active"); pages.forEach((page, pageId) => { page.hidden = pageId !== id; }); }); sidebar.append(nav); });
    const close = btn("moon-settings-close", "Fechar configurações", "close"); close.addEventListener("click", () => void this.#closeSettings());
    const appearance = this.#settingsPage("Aparência", "Personalize o Moon sem sacrificar legibilidade."); const accentGroup = this.#settingGroup("Cor de destaque", "Usada nos controles ativos e indicadores."); const accentGrid = el("div", "moon-accent-grid"); ACCENTS.forEach((accent, index) => { const accentButton = btn(`moon-accent-swatch moon-accent-swatch-${index}${accent === this.#preferences.accent ? " is-active" : ""}`, `Usar cor ${accent}`); accentButton.addEventListener("click", () => { this.#updatePreferences({ accent }); accentGrid.querySelectorAll(".moon-accent-swatch").forEach(item => item.classList.remove("is-active")); accentButton.classList.add("is-active"); }); accentGrid.append(accentButton); }); accentGroup.append(accentGrid);
    const wallpaperGroup = this.#settingGroup("Wallpaper", "Fundos locais do Moon; nenhum servidor externo é consultado."); const gallery = el("div", "moon-wallpaper-grid"); WALLPAPERS.forEach((url, index) => { const card = btn(`moon-wallpaper moon-wallpaper-preview-${index}${url === this.#preferences.wallpaper ? " is-active" : ""}`, "Selecionar wallpaper"); const preview = el("img", "moon-wallpaper-image"); preview.src = url; preview.alt = ""; card.append(preview); card.addEventListener("click", () => { this.#updatePreferences({ wallpaper: url }); gallery.querySelectorAll(".moon-wallpaper").forEach(item => item.classList.remove("is-active")); card.classList.add("is-active"); }); gallery.append(card); }); wallpaperGroup.append(gallery); appearance.append(accentGroup, wallpaperGroup);
    const themeGroup = this.#settingGroup("Temas salvos", "Guarde combinações de cor, wallpaper e painel."); const themeForm = el("div", "moon-custom-form"); const themeName = el("input", "moon-settings-input"); themeName.placeholder = "Nome do tema"; const saveTheme = btn("moon-primary-button", "Salvar tema atual", "plus"); saveTheme.append(el("span", "", "Salvar tema")); const themeList = el("div", "moon-settings-list"); const renderThemes = (): void => { themeList.replaceChildren(); this.#themes.forEach(theme => { const row = el("div", "moon-settings-list-row"); const apply = btn("moon-theme-apply", `Aplicar ${theme.name}`); const copy = el("span", "moon-list-copy"); copy.append(el("strong", "", theme.name), el("small", "", "Cor, wallpaper e estilo da home")); apply.append(copy); apply.addEventListener("click", () => this.#updatePreferences({ accent: theme.accent, wallpaper: theme.wallpaper, glassHome: theme.glassHome })); const remove = btn("moon-icon-button", `Excluir ${theme.name}`, "trash"); remove.addEventListener("click", () => { this.#themes = this.#themes.filter(item => item.id !== theme.id); save(KEYS.themes, this.#themes); renderThemes(); }); row.append(apply, remove); themeList.append(row); }); }; saveTheme.addEventListener("click", () => { const name = themeName.value.trim() || `Tema ${this.#themes.length + 1}`; this.#themes = [...this.#themes, { id: crypto.randomUUID(), name, accent: this.#preferences.accent, wallpaper: this.#preferences.wallpaper, glassHome: this.#preferences.glassHome }]; save(KEYS.themes, this.#themes); themeName.value = ""; renderThemes(); }); themeForm.append(themeName, saveTheme); renderThemes(); themeGroup.append(themeForm, themeList); appearance.append(themeGroup);
    const searchPage = this.#settingsPage("Pesquisa", "Escolha o motor das consultas na barra de endereço."); const searchGroup = this.#settingGroup("Motor de busca", "Endereços digitados diretamente continuam abrindo o site."); const select = el("select", "moon-select"); [["duckduckgo", "DuckDuckGo"], ["google", "Google"], ["brave", "Brave Search"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value!; option.selected = value === this.#preferences.searchEngine; select.append(option); }); select.addEventListener("change", () => this.#updatePreferences({ searchEngine: select.value as SearchEngine })); searchGroup.append(select); searchPage.append(searchGroup);
    const homePage = this.#settingsPage("Página inicial", "Controle o conteúdo de uma nova aba."); const options = this.#settingGroup("Elementos", "As alterações são aplicadas imediatamente."); options.append(this.#toggleSetting("Mostrar relógio e data", this.#preferences.showClock, checked => this.#updatePreferences({ showClock: checked })), this.#toggleSetting("Mostrar atalhos rápidos", this.#preferences.showShortcuts, checked => this.#updatePreferences({ showShortcuts: checked })), this.#toggleSetting("Usar painel de vidro", this.#preferences.glassHome, checked => this.#updatePreferences({ glassHome: checked })));
    const shortcutGroup = this.#settingGroup("Atalhos personalizados", "Adicione sites à página inicial."); const shortcutForm = el("div", "moon-custom-form"); const shortcutName = el("input", "moon-settings-input"); shortcutName.placeholder = "Nome"; const shortcutUrl = el("input", "moon-settings-input"); shortcutUrl.placeholder = "https://site.com"; const addShortcut = btn("moon-primary-button", "Adicionar atalho", "plus"); addShortcut.append(el("span", "", "Adicionar")); const shortcutList = el("div", "moon-settings-list"); const renderShortcutList = (): void => { shortcutList.replaceChildren(); this.#shortcuts.forEach(item => { const row = el("div", "moon-settings-list-row"); const copy = el("span", "moon-list-copy"); copy.append(el("strong", "", item.name), el("small", "", item.url)); const remove = btn("moon-icon-button", `Excluir ${item.name}`, "trash"); remove.addEventListener("click", () => { this.#shortcuts = this.#shortcuts.filter(shortcut => shortcut.id !== item.id); save(KEYS.shortcuts, this.#shortcuts); this.#renderHomeShortcuts(); renderShortcutList(); }); row.append(copy, remove); shortcutList.append(row); }); }; addShortcut.addEventListener("click", () => { const name = shortcutName.value.trim(); const url = shortcutUrl.value.trim(); if (!name || !url.startsWith("https://")) return this.#flash("Informe um nome e uma URL HTTPS."); this.#shortcuts = [...this.#shortcuts, { id: crypto.randomUUID(), name, url }]; save(KEYS.shortcuts, this.#shortcuts); shortcutName.value = ""; shortcutUrl.value = ""; this.#renderHomeShortcuts(); renderShortcutList(); }); shortcutForm.append(shortcutName, shortcutUrl, addShortcut); renderShortcutList(); shortcutGroup.append(shortcutForm, shortcutList);
    const reset = btn("moon-secondary-button", "Restaurar configurações", "reload"); reset.append(el("span", "", "Restaurar padrão")); reset.addEventListener("click", () => { this.#preferences = { ...DEFAULTS }; save(KEYS.preferences, this.#preferences); this.#applyPreferences(); void this.#closeSettings().then(() => this.#openSettings()); }); homePage.append(options, shortcutGroup, reset);
    const dataPage = this.#settingsPage("Dados e backup", "Exporte ou restaure os dados locais do seu perfil."); const dataGroup = this.#settingGroup("Backup do perfil", "Inclui favoritos, histórico, notas, workspaces e preferências. Senhas e cookies não são exportados."); const dataActions = el("div", "moon-settings-actions"); const exportButton = btn("moon-primary-button", "Exportar backup", "download"); exportButton.append(el("span", "", "Exportar backup")); exportButton.addEventListener("click", () => void this.#exportData()); const importButton = btn("moon-secondary-button", "Importar backup", "folder"); importButton.append(el("span", "", "Importar backup")); importButton.addEventListener("click", () => void this.#importData()); dataActions.append(exportButton, importButton); dataGroup.append(dataActions); dataPage.append(dataGroup);
    pages.set("appearance", appearance); pages.set("search", searchPage); pages.set("home", homePage); pages.set("data", dataPage); searchPage.hidden = true; homePage.hidden = true; dataPage.hidden = true; body.append(appearance, searchPage, homePage, dataPage); modal.append(sidebar, body, close); overlay.append(modal); overlay.addEventListener("click", event => { if (event.target === overlay) void this.#closeSettings(); }); this.#settings = overlay; this.container.append(overlay); this.#rail.get("settings")?.classList.add("is-active");
  }
  async #closeSettings(): Promise<void> { this.#settings?.remove(); this.#settings = undefined; this.#rail.get("settings")?.classList.remove("is-active"); if (this.#bridge && !this.#permissionPrompt) await this.#bridge.setContentVisible(true); requestAnimationFrame(() => this.#syncBounds()); }
  #enqueuePermissionPrompt(request: PermissionRequest): void {
    this.#permissionQueue.push(request);
    void this.#showNextPermissionPrompt();
  }
  async #showNextPermissionPrompt(): Promise<void> {
    if (!this.#bridge || this.#activePermission) return;
    const request = this.#permissionQueue.shift();
    if (!request) return;
    this.#activePermission = request;
    await this.#bridge.setContentVisible(false);
    let promptView: ReturnType<typeof createPermissionPrompt>;
    const respond = async (granted: boolean): Promise<void> => {
      promptView.disableActions();
      try { await this.#bridge!.respondToPermission(request.id, granted); }
      catch (error) { this.#showError(error); }
      promptView.element.remove(); this.#permissionPrompt = undefined; this.#activePermission = undefined;
      if (this.#permissionQueue.length > 0) await this.#showNextPermissionPrompt();
      else if (!this.#settings) await this.#bridge!.setContentVisible(true);
    };
    promptView = createPermissionPrompt(request, granted => { void respond(granted); });
    this.#permissionPrompt = promptView.element; this.container.append(promptView.element);
  }
  #settingsPage(title: string, detail: string): HTMLElement { const page = el("section", "moon-settings-page"); page.append(el("h1", "", title), el("p", "moon-settings-intro", detail)); return page; }
  #settingGroup(title: string, detail: string): HTMLElement { const group = el("div", "moon-setting-group"); group.append(el("h3", "", title), el("p", "", detail)); return group; }
  #toggleSetting(label: string, checked: boolean, change: (checked: boolean) => void): HTMLElement { const row = el("label", "moon-toggle-row"); const input = el("input"); input.type = "checkbox"; input.checked = checked; input.addEventListener("change", () => change(input.checked)); row.append(el("span", "", label), input, el("span", "moon-toggle-control")); return row; }
  #updatePreferences(patch: Partial<Preferences>): void { this.#preferences = { ...this.#preferences, ...patch }; save(KEYS.preferences, this.#preferences); this.#applyPreferences(); }
  async #exportData(): Promise<void> { if (!this.#bridge) return; const content = JSON.stringify(createMoonProfileBackup({ bookmarks: this.#bookmarks, history: this.#history, notes: this.#notes, shortcuts: this.#shortcuts, themes: this.#themes, workspaces: this.#workspaces, preferences: this.#preferences }), null, 2); const exported = await this.#bridge.exportProductData(content); this.#flash(exported ? "Backup exportado com sucesso." : "Exportação cancelada."); }
  async #migrateLegacyProfile(): Promise<void> { if (!this.#bridge || load<boolean>(KEYS.migration, false)) return; const backup = createMoonProfileBackup({ bookmarks: this.#bookmarks, history: this.#history, notes: this.#notes, shortcuts: this.#shortcuts, themes: this.#themes, workspaces: this.#workspaces, preferences: this.#preferences }); const result = await this.#bridge.migrateLegacyProfile(JSON.stringify(backup)); if (result.version >= 1) save(KEYS.migration, true); }
  async #importData(): Promise<void> { if (!this.#bridge) return; try { const content = await this.#bridge.importProductData(); if (!content) return; const data = parseMoonProfileBackup(content); this.#bookmarks = [...data.bookmarks]; this.#history = [...data.history].slice(0, 500); this.#notes = data.notes; this.#shortcuts = [...data.shortcuts]; this.#themes = [...data.themes]; this.#workspaces = [...data.workspaces]; this.#preferences = normalizePreferences(data.preferences); save(KEYS.bookmarks, this.#bookmarks); save(KEYS.history, this.#history); save(KEYS.notes, this.#notes); save(KEYS.shortcuts, this.#shortcuts); save(KEYS.themes, this.#themes); save(KEYS.workspaces, this.#workspaces); save(KEYS.preferences, this.#preferences); this.#renderHomeShortcuts(); this.#applyPreferences(); this.#render(); this.#flash("Backup restaurado com sucesso."); await this.#closeSettings(); } catch (error) { this.#showError(error); } }
  #applyPreferences(): void { const root = document.documentElement; for (let index = 0; index < ACCENTS.length; index += 1) root.classList.toggle(`moon-accent-${index}`, ACCENTS[index] === this.#preferences.accent); this.#homeView.applyPreferences(this.#preferences); }

  #startClock(): void { this.#homeView.startClock(); }
  #observe(): void { this.#resizeObserver = new ResizeObserver(() => this.#syncBounds()); this.#resizeObserver.observe(this.#viewport); window.addEventListener("resize", () => this.#syncBounds()); }
  #syncBounds(): void { if (!this.#bridge) return; const rect = this.#viewport.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return; void this.#bridge.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }).catch(error => this.#showError(error)); }
  #bindShortcuts(): void { window.addEventListener("keydown", event => { const mod = event.ctrlKey || event.metaKey; if (event.key === "Escape") { if (this.#settings) void this.#closeSettings(); else this.#closeDrawer(); } else if (mod && event.key.toLowerCase() === "l") { event.preventDefault(); this.#omnibox.focus(); this.#omnibox.select(); } else if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); this.#homeView.focusSearch(); } else if (mod && event.key.toLowerCase() === "t") { event.preventDefault(); void this.#createTab(); } else if (mod && event.key.toLowerCase() === "w" && this.#activeTabId) { event.preventDefault(); void this.#close(this.#activeTabId); } else if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); void this.#command("back"); } else if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); void this.#command("forward"); } }); }
  #isWeb(url: string): boolean { return url.startsWith("https://") || url.startsWith("http://"); }
  #hostname(url: string): string { try { return new URL(url).hostname; } catch { return url; } }
  #flash(message: string): void { this.#status.textContent = message; window.setTimeout(() => { if (this.#status.textContent === message) this.#status.textContent = ""; }, 2200); }
  #showError(error: unknown): void { const message = error instanceof Error ? error.message : String(error); this.#status.textContent = `Moon: ${message}`; console.error(error); }
}

const root = document.querySelector("#moon-root");
if (!(root instanceof HTMLElement)) throw new Error("Moon root was not found");
const app = new MoonApp(root);
app.router.register({ path: "/", title: "Moon Browser", async render(container) { await new BrowserShell(container).start(); } });
app.router.register({ path: "/404", title: "Não encontrado", render(container) { container.textContent = "Página não encontrada"; } });
await app.start();
