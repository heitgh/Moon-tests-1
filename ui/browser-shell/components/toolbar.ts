import { button, element } from "../dom.js";

export interface ToolbarActions {
  readonly onBack: () => void;
  readonly onForward: () => void;
  readonly onReload: () => void;
  readonly onNavigate: (value: string) => void;
  readonly onToggleBookmark: () => void;
  readonly onOpenSecurity: () => void;
  readonly onOpenAi: () => void;
}

export class Toolbar {
  readonly element = element("div", "moon-toolbar-v2");
  readonly omnibox = element("input", "moon-omnibox");
  readonly back = button("moon-nav-button", "Voltar", "back");
  readonly forward = button("moon-nav-button", "Avançar", "forward");
  readonly reload = button("moon-nav-button", "Recarregar", "reload");
  readonly bookmark = button("moon-nav-button moon-bookmark-button", "Adicionar aos favoritos", "star");
  readonly securityPill = button("moon-security-pill", "Proteção e AdBlock", "shield");
  readonly securityText = element("span", "moon-security-text", "AdBlock carregando");

  constructor(readonly actions: ToolbarActions) {
    this.back.addEventListener("click", actions.onBack);
    this.forward.addEventListener("click", actions.onForward);
    this.reload.addEventListener("click", actions.onReload);
    this.bookmark.addEventListener("click", actions.onToggleBookmark);
    this.securityPill.append(this.securityText);
    this.securityPill.addEventListener("click", actions.onOpenSecurity);

    const address = element("form", "moon-address");
    this.omnibox.type = "text";
    this.omnibox.autocomplete = "off";
    this.omnibox.spellcheck = false;
    this.omnibox.placeholder = "Pesquise ou digite um endereço";
    this.omnibox.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      actions.onNavigate(this.omnibox.value);
    });
    const go = button("moon-go-button", "Abrir endereço", "chevron");
    go.addEventListener("click", () => actions.onNavigate(this.omnibox.value));
    address.append(this.securityPill, this.omnibox, go, this.bookmark);
    address.addEventListener("submit", event => {
      event.preventDefault();
      actions.onNavigate(this.omnibox.value);
    });

    const ai = button("moon-ai-button", "Abrir Moon AI", "sparkles");
    ai.append(element("span", "", "Moon AI"));
    ai.addEventListener("click", actions.onOpenAi);
    this.element.append(this.back, this.forward, this.reload, address, ai);
  }
}
