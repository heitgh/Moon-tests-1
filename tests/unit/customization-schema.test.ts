import { describe, expect, it } from "vitest";
import {
  CUSTOMIZATION_LAST_VALID_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  createDefaultCustomization,
  migrateLegacyCustomization,
  parseCustomizationImport,
  resolveCustomization,
  serializeCustomization,
  validateCustomization
} from "../../ui/customization/customization-schema.js";
import { CustomizationStore } from "../../ui/customization/customization-store.js";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
}

describe("CustomizationSchemaV2", () => {
  it("creates a complete, valid and versioned default", () => {
    const document = validateCustomization(createDefaultCustomization(123));
    expect(document.version).toBe(2);
    expect(document.global.appearance.colors).toMatchObject({ background: "#0a0c11", accent: "#8a5cf5", danger: "#f43f5e" });
    expect(document.global.layout.toolbar.items).toHaveLength(12);
    expect(document.global.home.widgets).toHaveLength(15);
    expect(document.global.search.providers.map(provider => provider.id)).toContain("bing");
  });

  it("migrates every active V1 preference without losing it", () => {
    const storage = new MemoryStorage();
    storage.setItem("moon:preferences:v1", JSON.stringify({ accent: "#38bdf8", wallpaper: "./assets/wallpapers/eclipse.svg", searchEngine: "google", showClock: false, showShortcuts: false, glassHome: true }));
    const migrated = migrateLegacyCustomization(storage, 100);
    expect(migrated.global.appearance.colors.accent).toBe("#38bdf8");
    expect(migrated.global.appearance.wallpaper.source).toContain("eclipse.svg");
    expect(migrated.global.search.defaultEngine).toBe("google");
    expect(migrated.global.home.cardStyle).toBe("glass");
    expect(migrated.global.home.widgets.find(widget => widget.id === "clock")?.visible).toBe(false);
  });

  it("rejects unreadable colors and insecure search templates", () => {
    const document = createDefaultCustomization();
    const unreadable = structuredClone(document); (unreadable.global.appearance.colors as { text: string }).text = unreadable.global.appearance.colors.background;
    expect(() => validateCustomization(unreadable)).toThrow(/contraste/i);
    const insecure = structuredClone(document); (insecure.global.search.providers[0] as { template: string }).template = "http://search.test/?q={query}";
    expect(() => validateCustomization(insecure)).toThrow(/HTTPS/i);
  });

  it("round-trips all, appearance and workspace exports", () => {
    const current = createDefaultCustomization(100);
    for (const scope of ["all", "appearance", "workspace"] as const) {
      const serialized = serializeCustomization(current, scope, "research");
      const imported = parseCustomizationImport(serialized, createDefaultCustomization(200), "research");
      expect(imported.version).toBe(2);
      expect(resolveCustomization(imported, "research").appearance.colors.accent).toBe("#8a5cf5");
    }
  });
});

describe("CustomizationStore", () => {
  it("recovers the last valid document when the primary value is corrupt", () => {
    const storage = new MemoryStorage(); const valid = createDefaultCustomization(42);
    storage.setItem(CUSTOMIZATION_STORAGE_KEY, "{broken"); storage.setItem(CUSTOMIZATION_LAST_VALID_KEY, JSON.stringify(valid));
    const store = CustomizationStore.load(storage);
    expect(store.loadResult.recovered).toBe(true); expect(store.document.updatedAt).toBe(42);
  });

  it("applies live changes with undo, redo and preview cancellation", () => {
    const storage = new MemoryStorage(); const store = CustomizationStore.load(storage); const original = store.config.appearance.colors.accent;
    store.beginPreview(); expect(store.set("appearance.colors.accent", "#38bdf8")).toBe(true); expect(store.config.appearance.colors.accent).toBe("#38bdf8");
    expect(store.undo()).toBe(true); expect(store.config.appearance.colors.accent).toBe(original);
    expect(store.redo()).toBe(true); expect(store.config.appearance.colors.accent).toBe("#38bdf8");
    store.cancelPreview(); expect(store.config.appearance.colors.accent).toBe(original);
  });

  it("keeps workspace customization independent from global values", () => {
    const store = CustomizationStore.load(new MemoryStorage()); store.setWorkspace("research"); store.setScope("workspace");
    expect(store.set("layout.sidebar.position", "right")).toBe(true); expect(store.config.layout.sidebar.position).toBe("right");
    store.setWorkspace("study"); expect(store.config.layout.sidebar.position).toBe("left");
    store.setWorkspace("research"); expect(store.config.layout.sidebar.position).toBe("right");
  });

  it("rejects invalid updates without corrupting the persisted state", () => {
    const storage = new MemoryStorage(); const store = CustomizationStore.load(storage); const before = storage.getItem(CUSTOMIZATION_STORAGE_KEY);
    expect(store.set("appearance.colors.text", "javascript:bad")).toBe(false);
    expect(storage.getItem(CUSTOMIZATION_STORAGE_KEY)).toBe(before);
    expect(store.lastError).toMatch(/HEX/i);
  });
});
