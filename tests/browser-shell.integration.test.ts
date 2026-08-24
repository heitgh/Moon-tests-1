// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const tab = { id: "tab-1", url: "moon://newtab", title: "Nova guia", active: true, loading: false, workspaceId: "research", private: false };
const createTab = vi.fn(async (_url?: string, workspaceId?: string) => ({ ...tab, id: `tab-${createTab.mock.calls.length + 1}`, workspaceId: workspaceId ?? "research" }));
const navigate = vi.fn(async () => undefined);
const setContentVisible = vi.fn(async () => undefined);
const downloadListeners: Array<(downloads: readonly unknown[]) => void> = [];
const adblockListeners: Array<(status: unknown) => void> = [];
const tabUpdateListeners: Array<(update: unknown) => void> = [];
const permissionListeners: Array<(request: { readonly id: string; readonly origin: string; readonly permission: string }) => void> = [];
const bridge = {
  createTab, getTabs: vi.fn(async () => []), closeTab: vi.fn(async () => undefined), activateTab: vi.fn(async () => undefined), showHome: vi.fn(async () => undefined), navigate,
  back: vi.fn(async () => undefined), forward: vi.fn(async () => undefined), reload: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), setBounds: vi.fn(async () => undefined), setContentVisible, respondToPermission: vi.fn(async () => undefined),
  getDownloads: vi.fn(async () => []), pauseDownload: vi.fn(async () => undefined), resumeDownload: vi.fn(async () => undefined), cancelDownload: vi.fn(async () => undefined), openDownload: vi.fn(async () => undefined), showDownloadInFolder: vi.fn(async () => undefined), clearFinishedDownloads: vi.fn(async () => undefined),
  getAdblockStatus: vi.fn(async () => ({ phase: "active", enabled: true, blockedCount: 12 })), setAdblockEnabled: vi.fn(async (enabled: boolean) => ({ phase: enabled ? "active" : "disabled", enabled, blockedCount: 12 })),
  exportProductData: vi.fn(async (_content: string) => true), importProductData: vi.fn(async () => null), migrateLegacyProfile: vi.fn(async () => ({ migrated: true, version: 1 })), onTabUpdated: vi.fn((listener: (update: unknown) => void) => { tabUpdateListeners.push(listener); return () => undefined; }), onTabClosed: vi.fn(() => () => undefined),
  onDownloadsUpdated: vi.fn((listener: (downloads: readonly unknown[]) => void) => { downloadListeners.push(listener); return () => undefined; }),
  onAdblockStatus: vi.fn((listener: (status: unknown) => void) => { adblockListeners.push(listener); return () => undefined; }),
  onPermissionRequested: vi.fn((listener: (request: { readonly id: string; readonly origin: string; readonly permission: string }) => void) => { permissionListeners.push(listener); return () => undefined; })
};
const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0)); };

beforeAll(async () => {
  document.body.innerHTML = '<div id="moon-root"></div>';
  Object.defineProperty(window, "moonBrowser", { value: bridge, configurable: true });
  await import("../ui/browser-shell.js");
  await flush();
});
beforeEach(() => { navigate.mockClear(); setContentVisible.mockClear(); });

describe("Moon browser shell", () => {
  it("renders every primary product control", () => {
    for (const label of ["Página inicial", "Workspaces", "Favoritos", "Downloads", "Histórico", "Traduzir página", "Bloco de notas", "Extensões", "Moon AI", "Configurações"]) {
      expect(document.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
  });
  it("opens every sidebar module with its real content", () => {
    const modules = [
      ["Workspaces", "Workspaces"], ["Favoritos", "Favoritos"], ["Downloads", "Downloads"],
      ["Histórico", "Histórico"], ["Traduzir página", "Tradutor"], ["Bloco de notas", "Bloco de notas"],
      ["Extensões", "Extensões"], ["Moon AI", "Moon AI"], ["Proteção e AdBlock", "Proteção"]
    ] as const;
    for (const [control, heading] of modules) {
      (document.querySelector(`[aria-label="${control}"]`) as HTMLButtonElement).click();
      expect(document.querySelector(".moon-drawer.is-open .moon-drawer-title")?.textContent).toBe(heading);
      expect(document.querySelector(".moon-drawer.is-open .moon-drawer-body")?.childElementCount).toBeGreaterThan(0);
    }
  });
  it("persists notes entered through the real drawer", () => {
    (document.querySelector('[aria-label="Bloco de notas"]') as HTMLButtonElement).click();
    const notes = document.querySelector(".moon-notes-input") as HTMLTextAreaElement;
    notes.value = "Decisão importante da startup"; notes.dispatchEvent(new Event("input", { bubbles: true }));
    expect(JSON.parse(localStorage.getItem("moon:notes:v1") ?? '""')).toBe("Decisão importante da startup");
  });
  it("opens and closes settings while hiding native web content", async () => {
    (document.querySelector('[aria-label="Configurações"]') as HTMLButtonElement).click(); await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull(); expect(setContentVisible).toHaveBeenCalledWith(false);
    (document.querySelector('[aria-label="Fechar configurações"]') as HTMLButtonElement).click(); await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(setContentVisible).toHaveBeenLastCalledWith(true);
  });
  it("sends omnibox searches to the browser engine", async () => {
    const input = document.querySelector(".moon-omnibox") as HTMLInputElement; input.value = "arquitetura de navegadores";
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await flush();
    expect(navigate).toHaveBeenCalledWith(expect.any(String), "https://duckduckgo.com/?q=arquitetura%20de%20navegadores");
  });
  it("navigates the omnibox on Enter without duplicating form submission", async () => {
    const input = document.querySelector(".moon-omnibox") as HTMLInputElement;
    input.value = "https://example.com/";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await flush();
    expect(navigate).toHaveBeenCalledWith(expect.any(String), "https://example.com/");
  });
  it("renders live download updates instead of sample data", async () => {
    downloadListeners[0]?.([{ id: "download-1", url: "https://example.com/moon.zip", filename: "moon.zip", savePath: "/tmp/moon.zip", state: "in-progress", receivedBytes: 500, totalBytes: 1_000, speedBytesPerSecond: 100, percentage: 50, startedAt: Date.now() }]);
    (document.querySelector('[aria-label="Downloads"]') as HTMLButtonElement).click(); await flush();
    expect(document.querySelector(".moon-download-header")?.textContent).toContain("moon.zip");
    expect((document.querySelector(".moon-download-progress") as HTMLProgressElement).value).toBe(50);
  });
  it("creates named workspaces and opens a real isolated tab", async () => {
    (document.querySelector('[aria-label="Workspaces"]') as HTMLButtonElement).click();
    const name = document.querySelector('.moon-drawer input[placeholder="Nome do workspace"]') as HTMLInputElement;
    name.value = "Produto";
    name.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(createTab.mock.calls.at(-1)?.[1]).toMatch(/^workspace-/);
    expect(document.querySelector(".moon-drawer")?.textContent).toContain("Produto");
  });
  it("favorites the active page and persists it", async () => {
    tabUpdateListeners[0]?.({ tab: { ...tab, id: createTab.mock.results[0]?.value ? "tab-2" : "tab-1", url: "https://moon.test/", title: "Moon Test", active: true, loading: false }, navigation: { canGoBack: false, canGoForward: false } });
    await flush();
    (document.querySelector('[aria-label="Adicionar aos favoritos"]') as HTMLButtonElement).click();
    const saved = JSON.parse(localStorage.getItem("moon:bookmarks:v1") ?? "[]") as Array<{ url: string }>;
    expect(saved.some(item => item.url === "https://moon.test/")).toBe(true);
  });
  it("toggles the real adblock service from the protection panel", async () => {
    bridge.setAdblockEnabled.mockClear();
    (document.querySelector('[aria-label="Proteção e AdBlock"]') as HTMLButtonElement).click();
    const toggle = document.querySelector(".moon-adblock-toggle") as HTMLButtonElement;
    toggle.click(); await flush();
    expect(bridge.setAdblockEnabled).toHaveBeenCalledWith(false);
  });
  it("exports profile data through the native backup bridge", async () => {
    bridge.exportProductData.mockClear();
    (document.querySelector('[aria-label="Configurações"]') as HTMLButtonElement).click(); await flush();
    (document.querySelector('[aria-label="Dados e backup"]') as HTMLButtonElement).click();
    (document.querySelector('[aria-label="Exportar backup"]') as HTMLButtonElement).click(); await flush();
    expect(bridge.exportProductData).toHaveBeenCalledOnce();
    expect(bridge.exportProductData.mock.calls[0]?.[0]).toContain('"format": "moon-profile"');
    (document.querySelector('[aria-label="Fechar configurações"]') as HTMLButtonElement).click(); await flush();
  });
  it("queues site permissions and sends an explicit user decision", async () => {
    bridge.respondToPermission.mockClear(); setContentVisible.mockClear();
    permissionListeners[0]?.({ id: "permission-1", origin: "https://meet.example", permission: "media" });
    permissionListeners[0]?.({ id: "permission-2", origin: "https://maps.example", permission: "geolocation" });
    await flush();
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("meet.example");
    (document.querySelector('[aria-label="Negar permissão"]') as HTMLButtonElement).click(); await flush();
    expect(bridge.respondToPermission).toHaveBeenCalledWith("permission-1", false);
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("maps.example");
    (document.querySelector('[aria-label="Permitir acesso"]') as HTMLButtonElement).click(); await flush();
    expect(bridge.respondToPermission).toHaveBeenCalledWith("permission-2", true);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(setContentVisible).toHaveBeenLastCalledWith(true);
  });
});
