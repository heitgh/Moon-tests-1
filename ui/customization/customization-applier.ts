import type { CustomizationConfig, ThemeMode } from "./customization-schema.js";

export class CustomizationApplier {
  #media: MediaQueryList | undefined;
  #listener: (() => void) | undefined;
  #config: CustomizationConfig | undefined;

  constructor(readonly root: HTMLElement = document.documentElement) {}

  apply(config: CustomizationConfig): void {
    this.#config = config;
    const { appearance, layout, typography, home } = config;
    const resolvedMode = this.#resolveMode(appearance.mode, appearance.schedule.lightAt, appearance.schedule.darkAt);
    this.root.dataset.moonTheme = resolvedMode;
    this.root.dataset.moonThemeMode = appearance.mode;
    this.root.dataset.moonDensity = layout.density;
    this.root.dataset.moonSidebar = layout.sidebar.position;
    this.root.dataset.moonDrawer = layout.drawer.mode;
    this.root.dataset.moonToolbar = layout.toolbar.position;
    this.root.dataset.moonOmnibox = layout.omnibox.position;
    this.root.dataset.moonMotion = appearance.motion.enabled ? "on" : "off";
    this.root.dataset.moonGlass = appearance.glass.enabled ? "on" : "off";
    this.root.dataset.moonHomeCards = home.cardStyle;
    this.root.style.colorScheme = resolvedMode;
    const variables: Readonly<Record<string, string>> = {
      "--moon-user-accent": appearance.colors.accent, "--moon-user-accent-soft": `${appearance.colors.accent}32`,
      "--moon-bg": appearance.colors.background, "--moon-surface": appearance.colors.surface, "--moon-surface-raised": appearance.colors.elevated,
      "--moon-text": appearance.colors.text, "--moon-text-muted": appearance.colors.textMuted, "--moon-border": appearance.colors.border,
      "--moon-success": appearance.colors.success, "--moon-warning": appearance.colors.warning, "--moon-danger": appearance.colors.danger,
      "--moon-sidebar-width": `${layout.sidebar.width}px`, "--moon-sidebar-icon": `${layout.sidebar.iconSize}px`, "--moon-sidebar-gap": `${layout.sidebar.spacing}px`,
      "--moon-drawer-width": `${layout.drawer.width}px`, "--moon-toolbar-height": `${layout.toolbar.height}px`, "--moon-ui-scale": String(layout.uiScale),
      "--moon-sidebar-opacity": String(appearance.opacity.sidebar), "--moon-toolbar-opacity": String(appearance.opacity.toolbar), "--moon-card-opacity": String(appearance.opacity.cards),
      "--moon-drawer-opacity": String(appearance.opacity.drawers), "--moon-menu-opacity": String(appearance.opacity.menus), "--moon-modal-opacity": String(appearance.opacity.modals),
      "--moon-radius": `${appearance.shape.radius}px`, "--moon-border-width": `${appearance.shape.borderWidth}px`, "--moon-shadow-strength": String(appearance.shape.shadow),
      "--moon-spacing-scale": String(appearance.shape.spacing), "--moon-elevation": String(appearance.shape.elevation), "--moon-glass-blur": `${appearance.glass.intensity}px`,
      "--moon-motion-speed": String(appearance.motion.speed), "--moon-font-family": typography.family, "--moon-font-base": `${typography.baseSize}px`, "--moon-font-scale": String(typography.scale),
      "--moon-font-weight": String(typography.weight), "--moon-line-height": String(typography.lineHeight), "--moon-letter-spacing": `${typography.letterSpacing}em`,
      "--moon-ui-font-size": `${typography.uiSize}px`, "--moon-omnibox-font-size": `${typography.omniboxSize}px`, "--moon-tab-font-size": `${typography.tabSize}px`, "--moon-home-font-size": `${typography.homeSize}px`, "--moon-icon-scale": String(typography.iconScale),
      "--moon-home-columns": String(home.columns), "--moon-home-gap": `${home.gap}px`, "--moon-home-max-width": `${home.maxWidth}px`, "--moon-home-padding": `${home.padding}px`,
      "--moon-wallpaper-opacity": String(appearance.wallpaper.opacity), "--moon-wallpaper-blur": `${appearance.wallpaper.blur}px`, "--moon-wallpaper-brightness": String(appearance.wallpaper.brightness), "--moon-wallpaper-contrast": String(appearance.wallpaper.contrast), "--moon-wallpaper-saturation": String(appearance.wallpaper.saturation), "--moon-wallpaper-hue": `${appearance.wallpaper.hue}deg`, "--moon-wallpaper-dim": String(appearance.wallpaper.dim)
    };
    Object.entries(variables).forEach(([name, value]) => this.root.style.setProperty(name, value));
    document.body.style.fontFamily = typography.family;
    document.body.style.fontSize = `${typography.baseSize * typography.scale}px`;
    document.body.style.fontWeight = String(typography.weight);
    document.body.style.lineHeight = String(typography.lineHeight);
    document.body.style.letterSpacing = `${typography.letterSpacing}em`;
    this.#watchSystem(appearance.mode);
  }

  dispose(): void { if (this.#media && this.#listener) this.#media.removeEventListener("change", this.#listener); }

  #resolveMode(mode: ThemeMode, lightAt: string, darkAt: string): "light" | "dark" {
    if (mode === "light" || mode === "dark") return mode;
    if (mode === "system") return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const now = new Date(); const minutes = now.getHours() * 60 + now.getMinutes(); const [lh, lm] = lightAt.split(":").map(Number); const [dh, dm] = darkAt.split(":").map(Number); const light = lh! * 60 + lm!; const dark = dh! * 60 + dm!;
    return light < dark ? (minutes >= light && minutes < dark ? "light" : "dark") : (minutes >= light || minutes < dark ? "light" : "dark");
  }

  #watchSystem(mode: ThemeMode): void {
    if (this.#media && this.#listener) this.#media.removeEventListener("change", this.#listener);
    this.#media = undefined; this.#listener = undefined;
    if (mode !== "system") return;
    this.#media = matchMedia("(prefers-color-scheme: light)");
    this.#listener = () => { if (this.#config) this.apply(this.#config); };
    this.#media.addEventListener("change", this.#listener);
  }
}
