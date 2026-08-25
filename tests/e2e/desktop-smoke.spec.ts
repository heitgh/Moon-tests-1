import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const runtimeDirectory = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`;
const detectedWayland = process.env.WAYLAND_DISPLAY ?? (existsSync(join(runtimeDirectory, "wayland-1")) ? "wayland-1" : undefined);
const detectedDisplay = process.env.DISPLAY ?? (existsSync("/tmp/.X11-unix/X0") ? ":0" : undefined);
const desktopEnv = { ...process.env, ...(detectedWayland ? { WAYLAND_DISPLAY: detectedWayland, XDG_RUNTIME_DIR: runtimeDirectory } : {}), ...(detectedDisplay ? { DISPLAY: detectedDisplay } : {}) };
const platformArguments = detectedWayland
  ? ["--ozone-platform=wayland"]
  : [];

async function shellWindow(application: ElectronApplication): Promise<Page> {
  await expect.poll(() => application.windows().some(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))).toBe(true);
  return application.windows().find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))!;
}

async function selectValue(page: Page, label: string, value: string): Promise<void> {
  await page.locator("label.moon-field", { hasText: label }).locator("select").first().evaluate((node, next) => {
    const select = node as HTMLSelectElement; select.value = next; select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("starts the packaged desktop shell and opens every primary panel", async () => {
  const application = await electron.launch({
    args: [...platformArguments, "."],
    cwd: process.cwd(),
    env: { ...desktopEnv, NODE_ENV: "test" }
  });

  try {
    const window = await shellWindow(application);
    await expect(window.getByLabel("Página inicial", { exact: true })).toBeVisible();
    await expect(window.getByPlaceholder("Pesquise ou digite um endereço")).toBeVisible();

    const modules = [
      ["Workspaces", "Workspaces"],
      ["Favoritos", "Favoritos"],
      ["Downloads", "Downloads"],
      ["Histórico", "Histórico"],
      ["Traduzir página", "Tradutor"],
      ["Bloco de notas", "Bloco de notas"],
      ["Extensões", "Extensões"],
      ["Moon AI", "Moon AI"]
    ] as const;

    for (const [label, heading] of modules) {
      await window.getByLabel(label, { exact: true }).click();
      await expect(window.locator(".moon-drawer-title")).toHaveText(heading);
    }

    await window.getByLabel("Configurações", { exact: true }).click();
    await expect(window.getByRole("dialog")).toBeVisible();
    await expect(window.getByRole("heading", { name: "Aparência" })).toBeVisible();
  } finally {
    await application.close();
  }
});

test("restores the real tab session after an application restart", async () => {
  const userData = await mkdtemp(join(tmpdir(), "moon-e2e-profile-"));
  const launch = () => electron.launch({
    args: [...platformArguments, `--user-data-dir=${userData}`, "."],
    cwd: process.cwd(),
    env: { ...desktopEnv, NODE_ENV: "test", MOON_TEST_PROFILE_DIR: userData }
  });

  try {
    let application = await launch();
    try {
      const window = await shellWindow(application);
      await expect(window.locator(".moon-tab")).toHaveCount(1);
      await window.getByLabel("Nova aba (Ctrl+T)").click();
      await expect(window.locator(".moon-tab")).toHaveCount(2);
      await window.locator(".moon-tab").nth(1).click();
      const omnibox = window.getByPlaceholder("Pesquise ou digite um endereço");
      await omnibox.fill("https://example.com/");
      await window.getByLabel("Abrir endereço").click();
      await expect.poll(() => window.evaluate(() => (window as unknown as { moonBrowser: { getTabs(): Promise<Array<{ url: string }>> } }).moonBrowser.getTabs().then(tabs => tabs.map(tab => tab.url)))).toContain("https://example.com/");
    } finally {
      await application.close();
    }

    application = await launch();
    try {
      const restored = await shellWindow(application);
      await expect(restored.locator(".moon-tab")).toHaveCount(2);
      const restoredUrls = await restored.evaluate(() => (window as unknown as { moonBrowser: { getTabs(): Promise<Array<{ url: string }>> } }).moonBrowser.getTabs().then(tabs => tabs.map(tab => tab.url)));
      expect(restoredUrls).toContain("https://example.com/");
    } finally {
      await application.close();
    }
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
});

test("persists theme, sidebar and Home customization after restart", async () => {
  const userData = await mkdtemp(join(tmpdir(), "moon-e2e-customization-"));
  const launch = () => electron.launch({ args: [...platformArguments, `--user-data-dir=${userData}`, "."], cwd: process.cwd(), env: { ...desktopEnv, NODE_ENV: "test", MOON_TEST_PROFILE_DIR: userData } });
  try {
    let application = await launch();
    try {
      const window = await shellWindow(application);
      await window.getByLabel("Configurações", { exact: true }).click();
      await selectValue(window, "Modo", "light");
      await window.getByLabel("Layout e densidade", { exact: true }).click();
      await selectValue(window, "Posição", "right");
      await window.getByLabel("Home e widgets", { exact: true }).click();
      await window.locator('.moon-widget-setting[aria-label^="Relógio"] input[type="checkbox"]').evaluate(node => { const input = node as HTMLInputElement; input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true })); });
      await window.getByLabel("Aplicar personalização").click();
      await expect.poll(() => window.evaluate(() => document.documentElement.dataset.moonTheme)).toBe("light");
      await expect.poll(() => window.evaluate(() => document.documentElement.dataset.moonSidebar)).toBe("right");
    } finally { await application.close(); }

    application = await launch();
    try {
      const restored = await shellWindow(application);
      await expect.poll(() => restored.evaluate(() => document.documentElement.dataset.moonTheme)).toBe("light");
      await expect.poll(() => restored.evaluate(() => document.documentElement.dataset.moonSidebar)).toBe("right");
      await expect(restored.locator('.moon-home-clock[data-widget="clock"]')).toHaveCount(0);
      const storedVersion = await restored.evaluate(() => JSON.parse(localStorage.getItem("moon:customization:v2") ?? "{}").version as number);
      expect(storedVersion).toBe(2);
    } finally { await application.close(); }
  } finally { await rm(userData, { recursive: true, force: true }); }
});

test("exports and imports customization through the real desktop bridge", async () => {
  const userData = await mkdtemp(join(tmpdir(), "moon-e2e-portability-"));
  const exportPath = join(userData, "moon-customization.json");
  const application = await electron.launch({ args: [...platformArguments, `--user-data-dir=${userData}`, "."], cwd: process.cwd(), env: { ...desktopEnv, NODE_ENV: "test", MOON_TEST_PROFILE_DIR: userData } });
  try {
    const window = await shellWindow(application);
    await application.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, exportPath);
    await window.getByLabel("Configurações", { exact: true }).click();
    await selectValue(window, "Modo", "light");
    await window.getByLabel("Workspaces e dados", { exact: true }).click();
    await window.getByLabel("Exportar tudo").click();
    await expect.poll(async () => (await readFile(exportPath, "utf8")).includes('"moon-customization"')).toBe(true);

    await window.getByLabel("Aparência", { exact: true }).click();
    await selectValue(window, "Modo", "dark");
    await expect.poll(() => window.evaluate(() => document.documentElement.dataset.moonTheme)).toBe("dark");
    await application.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, exportPath);
    await window.getByLabel("Workspaces e dados", { exact: true }).click();
    window.once("dialog", dialog => void dialog.accept());
    await window.getByLabel("Importar personalização").click();
    await expect.poll(() => window.evaluate(() => document.documentElement.dataset.moonTheme)).toBe("light");
    await window.getByLabel("Aplicar personalização").click();
  } finally {
    await application.close();
    await rm(userData, { recursive: true, force: true });
  }
});
