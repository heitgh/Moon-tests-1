import { MoonApp } from "./app/app.js";
import { resolveNavigationInput } from "./browser/navigation-input.js";

interface BrowserTabState {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly active: boolean;
  readonly loading: boolean;
  readonly private: boolean;
}

interface BrowserNavigationState {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

interface BrowserTabUpdate {
  readonly tab: BrowserTabState;
  readonly navigation: BrowserNavigationState;
  readonly error?: string;
}

interface MoonBrowserBridge {
  createTab(url?: string): Promise<BrowserTabState>;
  getTabs(): Promise<readonly BrowserTabState[]>;
  closeTab(tabId: string): Promise<void>;
  activateTab(tabId: string): Promise<void>;
  showHome(tabId: string): Promise<void>;
  navigate(tabId: string, url: string): Promise<void>;
  back(tabId: string): Promise<void>;
  forward(tabId: string): Promise<void>;
  reload(tabId: string, bypassCache?: boolean): Promise<void>;
  stop(tabId: string): Promise<void>;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  onTabUpdated(listener: (update: BrowserTabUpdate) => void): () => void;
  onTabClosed(listener: (event: { readonly tabId: string }) => void): () => void;
}

declare global {
  interface Window { readonly moonBrowser?: MoonBrowserBridge; }
}

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

class MoonBrowserUi {
  readonly #tabs = new Map<string, BrowserTabState>();
  readonly #navigation = new Map<string, BrowserNavigationState>();
  readonly #bridge: MoonBrowserBridge | undefined;
  readonly #tabsList = element("div", "preview-tabs-list");
  readonly #omnibox = element("input", "preview-address-input");
  readonly #home = element("main", "preview-home");
  readonly #viewport = element("div", "preview-browser-viewport");
  readonly #backButton = element("button", "preview-nav-button", "‹");
  readonly #forwardButton = element("button", "preview-nav-button", "›");
  readonly #reloadButton = element("button", "preview-nav-button", "↻");
  readonly #status = element("div", "preview-status");
  #activeTabId: string | undefined;
  #resizeObserver: ResizeObserver | undefined;

  constructor(readonly container: HTMLElement) {
    this.#bridge = window.moonBrowser;
  }

  async start(): Promise<void> {
    this.#build();
    this.#bindKeyboardShortcuts();
    this.#observeViewport();

    if (!this.#bridge) {
      this.#status.textContent = "Prévia da interface — abra com Electron para navegar.";
      return;
    }

    this.#bridge.onTabUpdated(update => this.#applyUpdate(update));
    this.#bridge.onTabClosed(({ tabId }) => { void this.#handleClosed(tabId); });

    try {
      const tabs = await this.#bridge.getTabs();
      for (const tab of tabs) this.#tabs.set(tab.id, tab);
      const active = tabs.find(tab => tab.active);
      this.#activeTabId = active?.id;
      if (tabs.length === 0) await this.#createTab();
      else this.#renderState();
    } catch (error) {
      this.#showError(error);
    }
  }

  #build(): void {
    const shell = element("div", "preview-shell");
    const rail = element("aside", "preview-rail");
    const brand = element("div", "preview-brand", "M");
    brand.setAttribute("aria-label", "Moon");

    const homeButton = this.#button("preview-rail-button is-active", "⌂", "Página inicial");
    homeButton.addEventListener("click", () => { void this.#showHome(); });
    rail.append(
      brand,
      homeButton,
      this.#button("preview-rail-button", "◇", "Workspaces"),
      this.#button("preview-rail-button", "☆", "Favoritos"),
      this.#button("preview-rail-button", "◷", "Histórico"),
      this.#button("preview-rail-button", "⚙", "Configurações")
    );

    const workspace = element("section", "preview-workspace");
    const tabsBar = element("header", "preview-tabs");
    tabsBar.append(
      element("span", "preview-window-dot preview-window-dot--red"),
      element("span", "preview-window-dot preview-window-dot--yellow"),
      element("span", "preview-window-dot preview-window-dot--green"),
      this.#tabsList
    );
    const newTab = this.#button("preview-new-tab", "+", "Nova guia");
    newTab.addEventListener("click", () => { void this.#createTab(); });
    tabsBar.append(newTab);

    const toolbar = element("div", "preview-toolbar");
    this.#backButton.setAttribute("aria-label", "Voltar");
    this.#forwardButton.setAttribute("aria-label", "Avançar");
    this.#reloadButton.setAttribute("aria-label", "Recarregar");
    this.#backButton.addEventListener("click", () => { void this.#command("back"); });
    this.#forwardButton.addEventListener("click", () => { void this.#command("forward"); });
    this.#reloadButton.addEventListener("click", () => { void this.#reload(); });

    const address = element("form", "preview-address");
    address.setAttribute("aria-label", "Barra de endereço");
    this.#omnibox.type = "text";
    this.#omnibox.autocomplete = "off";
    this.#omnibox.spellcheck = false;
    this.#omnibox.placeholder = "Pesquise ou digite um endereço";
    address.append(element("span", "preview-address-icon", "⌕"), this.#omnibox);
    address.addEventListener("submit", event => {
      event.preventDefault();
      void this.#navigate(this.#omnibox.value);
    });

    const aiButton = this.#button("preview-ai-button", "✦  Moon AI", "Moon AI");
    aiButton.title = "Moon AI será conectada em uma próxima etapa";
    toolbar.append(this.#backButton, this.#forwardButton, this.#reloadButton, address, aiButton);

    const stage = element("div", "preview-content-stage");
    this.#buildHome();
    this.#viewport.setAttribute("aria-label", "Conteúdo da página atual");
    stage.append(this.#home, this.#viewport, this.#status);
    workspace.append(tabsBar, toolbar, stage);
    shell.append(rail, workspace);
    this.container.replaceChildren(shell);
  }

  #buildHome(): void {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia." : hour < 18 ? "Boa tarde." : "Boa noite.";
    const search = element("form", "preview-search");
    const input = element("input", "preview-search-input");
    input.type = "search";
    input.placeholder = "Pergunte ao Moon ou pesquise na web";
    search.append(
      element("span", "preview-search-icon", "⌕"),
      input,
      element("span", "preview-shortcut", "Ctrl  K")
    );
    search.addEventListener("submit", event => {
      event.preventDefault();
      void this.#navigate(input.value);
    });

    const cards = element("div", "preview-cards");
    for (const [icon, title, detail] of [
      ["✦", "Pesquise com liberdade", "Abra páginas reais usando o Chromium do Electron"],
      ["▦", "Organize suas abas", "Crie, alterne e feche guias sem perder o contexto"],
      ["◌", "Navegação protegida", "Isolamento de contexto e processos por padrão"]
    ]) {
      const card = element("article", "preview-card");
      card.append(
        element("span", "preview-card-icon", icon),
        element("h2", "preview-card-title", title),
        element("p", "preview-card-detail", detail)
      );
      cards.append(card);
    }

    this.#home.append(
      element("p", "preview-eyebrow", "NAVEGUE COM INTELIGÊNCIA"),
      element("h1", "preview-heading", greeting),
      element("p", "preview-subheading", "Onde a sua curiosidade quer chegar hoje?"),
      search,
      cards
    );
  }

  #button(className: string, text: string, label: string): HTMLButtonElement {
    const button = element("button", className, text);
    button.type = "button";
    button.setAttribute("aria-label", label);
    return button;
  }

  async #createTab(url?: string): Promise<void> {
    if (!this.#bridge) return;
    try {
      const tab = await this.#bridge.createTab(url);
      this.#tabs.set(tab.id, tab);
      this.#activeTabId = tab.id;
      this.#renderState();
    } catch (error) { this.#showError(error); }
  }

  async #activateTab(tabId: string): Promise<void> {
    if (!this.#bridge || !this.#tabs.has(tabId)) return;
    this.#activeTabId = tabId;
    for (const [id, tab] of this.#tabs) this.#tabs.set(id, { ...tab, active: id === tabId });
    this.#renderState();
    try { await this.#bridge.activateTab(tabId); }
    catch (error) { this.#showError(error); }
  }

  async #closeTab(tabId: string): Promise<void> {
    if (!this.#bridge) return;
    try { await this.#bridge.closeTab(tabId); }
    catch (error) { this.#showError(error); }
  }

  async #handleClosed(tabId: string): Promise<void> {
    this.#tabs.delete(tabId);
    this.#navigation.delete(tabId);
    const active = [...this.#tabs.values()].find(tab => tab.active) ?? [...this.#tabs.values()].at(-1);
    this.#activeTabId = active?.id;
    if (this.#tabs.size === 0) await this.#createTab();
    else this.#renderState();
  }

  async #showHome(): Promise<void> {
    if (!this.#bridge) return;
    if (!this.#activeTabId) return this.#createTab();
    try { await this.#bridge.showHome(this.#activeTabId); }
    catch (error) { this.#showError(error); }
  }

  async #navigate(value: string): Promise<void> {
    if (!this.#bridge) return;
    const url = resolveNavigationInput(value);
    if (url === "moon://newtab") return this.#showHome();
    if (!this.#activeTabId) {
      await this.#createTab(url);
      return;
    }
    this.#status.textContent = "";
    try { await this.#bridge.navigate(this.#activeTabId, url); }
    catch (error) { this.#showError(error); }
  }

  async #command(command: "back" | "forward"): Promise<void> {
    if (!this.#bridge || !this.#activeTabId) return;
    try { await this.#bridge[command](this.#activeTabId); }
    catch (error) { this.#showError(error); }
  }

  async #reload(): Promise<void> {
    if (!this.#bridge || !this.#activeTabId) return;
    const tab = this.#tabs.get(this.#activeTabId);
    try {
      if (tab?.loading) await this.#bridge.stop(this.#activeTabId);
      else await this.#bridge.reload(this.#activeTabId);
    } catch (error) { this.#showError(error); }
  }

  #applyUpdate(update: BrowserTabUpdate): void {
    this.#tabs.set(update.tab.id, update.tab);
    this.#navigation.set(update.tab.id, update.navigation);
    if (update.tab.active) this.#activeTabId = update.tab.id;
    if (update.error) this.#status.textContent = `Não foi possível abrir a página: ${update.error}`;
    this.#renderState();
  }

  #renderState(): void {
    const active = this.#activeTabId ? this.#tabs.get(this.#activeTabId) : undefined;
    this.#tabsList.replaceChildren();
    for (const tab of this.#tabs.values()) {
      const tabButton = this.#button(
        `preview-tab${tab.id === this.#activeTabId ? " preview-tab--active" : ""}`,
        "",
        tab.title
      );
      const indicator = element("span", `preview-tab-indicator${tab.loading ? " is-loading" : ""}`, "●");
      const title = element("span", "preview-tab-title", tab.title || "Nova guia");
      const close = element("span", "preview-tab-close", "×");
      close.setAttribute("role", "button");
      close.setAttribute("aria-label", `Fechar ${tab.title}`);
      close.addEventListener("click", event => {
        event.stopPropagation();
        void this.#closeTab(tab.id);
      });
      tabButton.append(indicator, title, close);
      tabButton.addEventListener("click", () => { void this.#activateTab(tab.id); });
      this.#tabsList.append(tabButton);
    }

    const homeActive = !active || active.url === "moon://newtab";
    this.#home.hidden = !homeActive;
    this.#omnibox.value = homeActive ? "" : active.url;
    const navigation = active ? this.#navigation.get(active.id) : undefined;
    this.#backButton.disabled = !navigation?.canGoBack;
    this.#forwardButton.disabled = !navigation?.canGoForward;
    this.#reloadButton.textContent = active?.loading ? "×" : "↻";
    this.#reloadButton.setAttribute("aria-label", active?.loading ? "Parar" : "Recarregar");
    requestAnimationFrame(() => this.#syncBounds());
  }

  #observeViewport(): void {
    this.#resizeObserver = new ResizeObserver(() => this.#syncBounds());
    this.#resizeObserver.observe(this.#viewport);
    window.addEventListener("resize", () => this.#syncBounds());
  }

  #syncBounds(): void {
    if (!this.#bridge) return;
    const rect = this.#viewport.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    void this.#bridge.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }).catch(error => this.#showError(error));
  }

  #bindKeyboardShortcuts(): void {
    window.addEventListener("keydown", event => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "l") {
        event.preventDefault();
        this.#omnibox.focus();
        this.#omnibox.select();
      } else if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const search = this.#home.querySelector("input");
        if (search instanceof HTMLInputElement) search.focus();
      } else if (modifier && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void this.#createTab();
      } else if (modifier && event.key.toLowerCase() === "w" && this.#activeTabId) {
        event.preventDefault();
        void this.#closeTab(this.#activeTabId);
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        void this.#command("back");
      } else if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        void this.#command("forward");
      }
    });
  }

  #showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#status.textContent = `Moon: ${message}`;
    console.error(error);
  }
}

const root = document.querySelector("#moon-root");
if (!(root instanceof HTMLElement)) throw new Error("Moon root was not found");

const app = new MoonApp(root);
app.router.register({
  path: "/",
  title: "Início",
  async render(container) { await new MoonBrowserUi(container).start(); }
});
app.router.register({
  path: "/404",
  title: "Não encontrado",
  render(container) { container.textContent = "Página não encontrada"; }
});

await app.start();
