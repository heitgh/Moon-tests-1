import {
  CUSTOMIZATION_LAST_VALID_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  CUSTOMIZATION_V2_LAST_VALID_KEY,
  CUSTOMIZATION_V2_STORAGE_KEY,
  clone,
  createDefaultCustomization,
  migrateLegacyCustomization,
  parseCustomizationImport,
  resolveCustomization,
  serializeCustomization,
  setResolved,
  validateCustomization,
  type CustomizationConfig,
  type CustomizationSchemaV2,
  type SavedCustomizationTheme,
  type SettingsMode,
  type SettingsScope
} from "./customization-schema.js";
import type { MoonThemeTokens } from "../../packages/theme-contract/types.js";

export interface CustomizationChange {
  readonly document: CustomizationSchemaV2;
  readonly config: CustomizationConfig;
  readonly workspaceId?: string;
  readonly reason: "boot" | "update" | "undo" | "redo" | "cancel" | "import" | "reset" | "scope" | "theme";
}

export interface CustomizationLoadResult { readonly recovered: boolean; readonly message?: string; }
type Listener = (change: CustomizationChange) => void;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export class CustomizationStore {
  readonly #listeners = new Set<Listener>();
  readonly #undo: CustomizationSchemaV2[] = [];
  readonly #redo: CustomizationSchemaV2[] = [];
  #document: CustomizationSchemaV2;
  #workspaceId: string | undefined;
  #previewSnapshot: CustomizationSchemaV2 | undefined;
  #lastError: string | undefined;

  private constructor(readonly storage: Storage, document: CustomizationSchemaV2, result: CustomizationLoadResult) {
    this.#document = document;
    this.loadResult = result;
  }

  readonly loadResult: CustomizationLoadResult;

  static load(storage: Storage = localStorage): CustomizationStore {
    const currentRaw = storage.getItem(CUSTOMIZATION_STORAGE_KEY); const legacyRaw = storage.getItem(CUSTOMIZATION_V2_STORAGE_KEY); const raw = currentRaw ?? legacyRaw;
    if (!raw) {
      const migrated = migrateLegacyCustomization(storage);
      persist(storage, migrated);
      return new CustomizationStore(storage, migrated, { recovered: false, message: "Preferências anteriores migradas para o Moon Settings V3." });
    }
    try {
      const document = validateCustomization(JSON.parse(raw));
      if (!currentRaw && legacyRaw) persist(storage, document); else storage.setItem(CUSTOMIZATION_LAST_VALID_KEY, JSON.stringify(document));
      return new CustomizationStore(storage, document, { recovered: false, ...(!currentRaw && legacyRaw ? { message: "Personalização V2 migrada para V3 sem alterar o original." } : {}) });
    } catch (error) {
      const backup = storage.getItem(CUSTOMIZATION_LAST_VALID_KEY) ?? storage.getItem(CUSTOMIZATION_V2_LAST_VALID_KEY);
      if (backup) {
        try {
          const recovered = validateCustomization(JSON.parse(backup));
          persist(storage, recovered);
          return new CustomizationStore(storage, recovered, { recovered: true, message: "Configuração corrompida: o último estado válido foi restaurado." });
        } catch { /* fall through to defaults */ }
      }
      const defaults = createDefaultCustomization();
      persist(storage, defaults);
      const detail = error instanceof Error ? error.message : String(error);
      return new CustomizationStore(storage, defaults, { recovered: true, message: `Configuração inválida (${detail}). Os padrões seguros foram restaurados.` });
    }
  }

  get document(): CustomizationSchemaV2 { return clone(this.#document); }
  get config(): CustomizationConfig { return clone(resolveCustomization(this.#document, this.#workspaceId)); }
  get workspaceId(): string | undefined { return this.#workspaceId; }
  get canUndo(): boolean { return this.#undo.length > 0; }
  get canRedo(): boolean { return this.#redo.length > 0; }
  get lastError(): string | undefined { return this.#lastError; }
  get previewing(): boolean { return this.#previewSnapshot !== undefined; }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener({ document: this.document, config: this.config, workspaceId: this.#workspaceId, reason: "boot" });
    return () => this.#listeners.delete(listener);
  }

  setWorkspace(workspaceId: string): void {
    this.#workspaceId = workspaceId;
    this.#emit("scope");
  }

  setScope(scope: SettingsScope): void {
    if (scope === this.#document.scope) return;
    this.#mutate(document => { (document as { scope: SettingsScope }).scope = scope; if (scope === "workspace" && this.#workspaceId && !document.workspaces[this.#workspaceId]) (document.workspaces as Record<string, CustomizationConfig>)[this.#workspaceId] = clone(document.global); }, "scope");
  }

  setExperience(mode: SettingsMode, lastSection = this.#document.experience.lastSection): void {
    const update = (document: CustomizationSchemaV2): CustomizationSchemaV2 => validateCustomization({ ...document, experience: { mode, lastSection }, updatedAt: Date.now() });
    this.#document = update(this.#document); if (this.#previewSnapshot) this.#previewSnapshot = update(this.#previewSnapshot); this.#save(); this.#emit("update");
  }

  update(mutator: (config: CustomizationConfig) => void): boolean {
    return this.#mutate(document => { const next = clone(resolveCustomization(document, this.#workspaceId)); mutator(next); setResolved(document, this.#workspaceId, next); }, "update");
  }

  set(path: string, value: unknown): boolean {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0 || segments.some(segment => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(segment))) return false;
    return this.update(config => {
      let target = config as unknown as Record<string, unknown>;
      for (const segment of segments.slice(0, -1)) {
        const next = target[segment];
        if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error(`Caminho de configuração inválido: ${path}`);
        target = next as Record<string, unknown>;
      }
      target[segments.at(-1)!] = value;
    });
  }

  beginPreview(): void {
    if (!this.#previewSnapshot) this.#previewSnapshot = this.document;
  }

  applyPreview(): void {
    this.#previewSnapshot = undefined;
    this.#undo.length = 0;
    this.#redo.length = 0;
  }

  cancelPreview(): void {
    if (!this.#previewSnapshot) return;
    this.#document = this.#previewSnapshot;
    this.#previewSnapshot = undefined;
    this.#undo.length = 0;
    this.#redo.length = 0;
    this.#save();
    this.#emit("cancel");
  }

  undo(): boolean {
    const previous = this.#undo.pop(); if (!previous) return false;
    this.#redo.push(this.document); this.#document = previous; this.#save(); this.#emit("undo"); return true;
  }

  redo(): boolean {
    const next = this.#redo.pop(); if (!next) return false;
    this.#undo.push(this.document); this.#document = next; this.#save(); this.#emit("redo"); return true;
  }

  resetSection(section: keyof CustomizationConfig): void {
    const defaults = createDefaultCustomization().global;
    this.update(config => { (config as unknown as Record<string, unknown>)[section] = clone(defaults[section]); });
    this.#emit("reset");
  }

  resetAll(scope: "current" | "everything" = "current"): void {
    if (scope === "everything") {
      const next = createDefaultCustomization();
      this.#replace(next, "reset");
      return;
    }
    this.#mutate(document => setResolved(document, this.#workspaceId, clone(createDefaultCustomization().global)), "reset");
  }

  saveTheme(name: string): SavedCustomizationTheme {
    const cleanName = name.trim(); if (!cleanName || cleanName.length > 100) throw new Error("Dê ao tema um nome de até 100 caracteres.");
    const theme: SavedCustomizationTheme = { id: crypto.randomUUID(), name: cleanName, createdAt: Date.now(), config: this.config };
    this.#mutate(document => { (document.themes as SavedCustomizationTheme[]).push(theme); }, "theme");
    return theme;
  }

  duplicateTheme(id: string): SavedCustomizationTheme {
    const source = this.#document.themes.find(theme => theme.id === id); if (!source) throw new Error("Tema não encontrado.");
    const copy = { ...clone(source), id: crypto.randomUUID(), name: `${source.name} — cópia`, createdAt: Date.now() };
    this.#mutate(document => { (document.themes as SavedCustomizationTheme[]).push(copy); }, "theme"); return copy;
  }

  renameTheme(id: string, name: string): void {
    const cleanName = name.trim(); if (!cleanName || cleanName.length > 100) throw new Error("Nome de tema inválido.");
    this.#mutate(document => { const index = document.themes.findIndex(theme => theme.id === id); if (index < 0) throw new Error("Tema não encontrado."); (document.themes as SavedCustomizationTheme[])[index] = { ...document.themes[index]!, name: cleanName }; }, "theme");
  }

  deleteTheme(id: string): void {
    this.#mutate(document => { (document as { themes: readonly SavedCustomizationTheme[] }).themes = document.themes.filter(theme => theme.id !== id); }, "theme");
  }

  applyTheme(id: string): void {
    const theme = this.#document.themes.find(candidate => candidate.id === id); if (!theme) throw new Error("Tema não encontrado.");
    this.#mutate(document => setResolved(document, this.#workspaceId, clone(theme.config)), "theme");
  }

  applyMoonTheme(tokens: MoonThemeTokens, wallpaperData?: string): boolean {
    const families = { system: "Inter, ui-sans-serif, system-ui, sans-serif", serif: "ui-serif, Georgia, serif", mono: "ui-monospace, SFMono-Regular, Consolas, monospace" } as const;
    const scales = { compact: 0.92, default: 1, large: 1.12 } as const;
    return this.update(config => {
      const appearance = config.appearance as Mutable<typeof config.appearance>;
      if (tokens.colors) {
        const colors = appearance.colors as Mutable<typeof appearance.colors>;
        if (tokens.colors.background) colors.background = tokens.colors.background;
        if (tokens.colors.surface) colors.surface = tokens.colors.surface;
        if (tokens.colors.surfaceElevated) colors.elevated = tokens.colors.surfaceElevated;
        if (tokens.colors.text) colors.text = tokens.colors.text;
        if (tokens.colors.textMuted) colors.textMuted = tokens.colors.textMuted;
        if (tokens.colors.accent) colors.accent = tokens.colors.accent;
        if (tokens.colors.border) colors.border = tokens.colors.border;
      }
      if (tokens.shape?.radius !== undefined) (appearance.shape as Mutable<typeof appearance.shape>).radius = tokens.shape.radius;
      if (tokens.shape?.borderWidth !== undefined) (appearance.shape as Mutable<typeof appearance.shape>).borderWidth = tokens.shape.borderWidth;
      if (tokens.shape?.shadow !== undefined) (appearance.shape as Mutable<typeof appearance.shape>).shadow = tokens.shape.shadow;
      if (tokens.shape?.elevation !== undefined) (appearance.shape as Mutable<typeof appearance.shape>).elevation = tokens.shape.elevation;
      if (tokens.shape?.spacing !== undefined) (appearance.shape as Mutable<typeof appearance.shape>).spacing = tokens.shape.spacing;
      if (tokens.shape?.density) (config.layout as Mutable<typeof config.layout>).density = tokens.shape.density;
      if (tokens.glass?.enabled !== undefined) (appearance.glass as Mutable<typeof appearance.glass>).enabled = tokens.glass.enabled;
      if (tokens.glass?.blur !== undefined) (appearance.glass as Mutable<typeof appearance.glass>).intensity = tokens.glass.blur;
      if (tokens.glass?.intensity !== undefined) (appearance.glass as Mutable<typeof appearance.glass>).intensity = tokens.glass.intensity;
      if (tokens.glass?.opacity !== undefined) (appearance.opacity as Mutable<typeof appearance.opacity>).cards = tokens.glass.opacity;
      if (tokens.wallpaper && wallpaperData) {
        const wallpaper = appearance.wallpaper as Mutable<typeof appearance.wallpaper>; wallpaper.type = "local"; wallpaper.source = wallpaperData; wallpaper.cachedData = undefined;
        if (tokens.wallpaper.dim !== undefined) wallpaper.dim = tokens.wallpaper.dim;
        if (tokens.wallpaper.blur !== undefined) wallpaper.blur = tokens.wallpaper.blur;
        if (tokens.wallpaper.fit !== undefined) wallpaper.fit = tokens.wallpaper.fit;
        if (tokens.wallpaper.position !== undefined) wallpaper.position = tokens.wallpaper.position;
        if (tokens.wallpaper.repeat !== undefined) wallpaper.repeat = tokens.wallpaper.repeat;
        if (tokens.wallpaper.opacity !== undefined) wallpaper.opacity = tokens.wallpaper.opacity;
        if (tokens.wallpaper.brightness !== undefined) wallpaper.brightness = tokens.wallpaper.brightness;
        if (tokens.wallpaper.contrast !== undefined) wallpaper.contrast = tokens.wallpaper.contrast;
        if (tokens.wallpaper.saturation !== undefined) wallpaper.saturation = tokens.wallpaper.saturation;
        if (tokens.wallpaper.hue !== undefined) wallpaper.hue = tokens.wallpaper.hue;
      }
      if (tokens.typography?.family) (config.typography as Mutable<typeof config.typography>).family = families[tokens.typography.family];
      if (tokens.typography?.scale) (config.typography as Mutable<typeof config.typography>).scale = scales[tokens.typography.scale];
      if (tokens.layout?.sidebar) (config.layout.sidebar as Mutable<typeof config.layout.sidebar>).position = tokens.layout.sidebar;
      if (tokens.layout?.tabStyle) (config.layout as Mutable<typeof config.layout>).density = tokens.layout.tabStyle;
    });
  }

  export(scope: "all" | "appearance" | "workspace" = "all"): string { return serializeCustomization(this.#document, scope, this.#workspaceId); }

  import(content: string): void {
    const next = parseCustomizationImport(content, this.#document, this.#workspaceId);
    this.#replace(next, "import");
  }

  #mutate(mutator: (document: CustomizationSchemaV2) => void, reason: CustomizationChange["reason"]): boolean {
    const previous = this.document; const candidate = this.document;
    try {
      mutator(candidate);
      const validated = validateCustomization({ ...candidate, revision: candidate.revision + 1, updatedAt: Date.now() });
      this.#undo.push(previous); if (this.#undo.length > 80) this.#undo.shift(); this.#redo.length = 0; this.#document = validated; this.#lastError = undefined; this.#save(); this.#emit(reason); return true;
    } catch (error) { this.#lastError = error instanceof Error ? error.message : String(error); return false; }
  }

  #replace(next: CustomizationSchemaV2, reason: CustomizationChange["reason"]): void {
    this.#undo.push(this.document); this.#redo.length = 0; this.#document = validateCustomization(next); this.#lastError = undefined; this.#save(); this.#emit(reason);
  }

  #save(): void { persist(this.storage, this.#document); }
  #emit(reason: CustomizationChange["reason"]): void { const change: CustomizationChange = { document: this.document, config: this.config, workspaceId: this.#workspaceId, reason }; this.#listeners.forEach(listener => listener(change)); }
}

function persist(storage: Storage, document: CustomizationSchemaV2): void {
  const serialized = JSON.stringify(document);
  storage.setItem(CUSTOMIZATION_STORAGE_KEY, serialized);
  storage.setItem(CUSTOMIZATION_LAST_VALID_KEY, serialized);
}
