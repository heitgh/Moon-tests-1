import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const platformArguments = process.env.WAYLAND_DISPLAY
  ? ["--ozone-platform=wayland"]
  : [];

async function shellWindow(application: ElectronApplication): Promise<Page> {
  await expect.poll(() => application.windows().some(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))).toBe(true);
  return application.windows().find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))!;
}

test("starts the packaged desktop shell and opens every primary panel", async () => {
  const application = await electron.launch({
    args: [...platformArguments, "."],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" }
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
    env: { ...process.env, NODE_ENV: "test", MOON_TEST_PROFILE_DIR: userData }
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
