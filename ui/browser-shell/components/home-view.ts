import type { Preferences, Shortcut } from "../contracts.js";
import { button, element, icon } from "../dom.js";

const DEFAULT_SHORTCUTS: readonly Shortcut[] = [
  { id: "github", name: "GitHub", url: "https://github.com" },
  { id: "youtube", name: "YouTube", url: "https://youtube.com" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
  { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com" }
];

export class HomeView {
  readonly element = element("main", "moon-home");
  readonly #panel = element("div", "moon-home-panel");
  readonly #clock = element("div", "moon-home-clock");
  readonly #date = element("div", "moon-home-date");
  readonly #wallpaperImage = element("img", "moon-home-wallpaper");
  readonly #shortcuts = element("div", "moon-home-shortcuts");
  readonly #searchInput = element("input", "moon-home-search-input");
  #clockTimer: number | undefined;

  constructor(readonly onNavigate: (value: string) => void) {
    const identity = element("div", "moon-home-identity");
    identity.append(icon("moon", "moon-home-logo"), element("span", "", "Moon"));

    const search = element("form", "moon-home-search");
    this.#searchInput.type = "search";
    this.#searchInput.placeholder = "Pesquisar na web";
    const submit = button("moon-home-search-button", "Pesquisar", "search");
    search.append(icon("search"), this.#searchInput, element("kbd", "moon-shortcut", "Ctrl K"), submit);
    search.addEventListener("submit", event => {
      event.preventDefault();
      this.onNavigate(this.#searchInput.value);
    });

    this.#panel.append(
      this.#clock,
      this.#date,
      identity,
      element("p", "moon-home-greeting", "Onde você quer chegar hoje?"),
      search,
      this.#shortcuts
    );
    this.element.append(this.#wallpaperImage, this.#panel);
  }

  renderShortcuts(customShortcuts: readonly Shortcut[]): void {
    this.#shortcuts.replaceChildren();
    for (const shortcutData of [...DEFAULT_SHORTCUTS, ...customShortcuts]) {
      const shortcut = button("moon-shortcut-button", shortcutData.name);
      shortcut.append(
        element("span", "moon-shortcut-mark", shortcutData.name.slice(0, 2).toUpperCase()),
        element("span", "moon-shortcut-label", shortcutData.name)
      );
      shortcut.addEventListener("click", () => this.onNavigate(shortcutData.url));
      this.#shortcuts.append(shortcut);
    }
  }

  applyPreferences(preferences: Preferences): void {
    this.#wallpaperImage.src = preferences.wallpaper;
    this.#clock.hidden = !preferences.showClock;
    this.#date.hidden = !preferences.showClock;
    this.#shortcuts.toggleAttribute("hidden", !preferences.showShortcuts);
    this.#panel.classList.toggle("is-card", preferences.glassHome);
  }

  startClock(): void {
    const update = (): void => {
      const now = new Date();
      this.#clock.textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(now);
      this.#date.textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now);
    };
    update();
    if (this.#clockTimer !== undefined) window.clearInterval(this.#clockTimer);
    this.#clockTimer = window.setInterval(update, 30_000);
  }

  focusSearch(): void {
    this.#searchInput.focus();
  }
}
