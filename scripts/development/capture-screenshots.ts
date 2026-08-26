import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

async function shellWindow(application: ElectronApplication): Promise<Page> {
  await expect.poll(() => application.windows().some(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))).toBe(true);
  return application.windows().find(page => page.url().startsWith("file:") && page.url().endsWith("/index.html"))!;
}

const profile = await mkdtemp(join(tmpdir(), "moon-screenshot-profile-"));
const runtimeDirectory = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`;
const detectedWayland = process.env.WAYLAND_DISPLAY ?? (existsSync(join(runtimeDirectory, "wayland-1")) ? "wayland-1" : undefined);
const detectedDisplay = process.env.DISPLAY ?? (existsSync("/tmp/.X11-unix/X0") ? ":0" : undefined);
const desktopEnv = {
  ...process.env,
  ...(detectedWayland ? { WAYLAND_DISPLAY: detectedWayland, XDG_RUNTIME_DIR: runtimeDirectory } : {}),
  ...(detectedDisplay ? { DISPLAY: detectedDisplay } : {})
};
const platformArguments = detectedWayland ? ["--ozone-platform=wayland"] : [];
const application = await electron.launch({
  args: [...platformArguments, `--user-data-dir=${profile}`, "."],
  cwd: process.cwd(),
  env: { ...desktopEnv, NODE_ENV: "test", MOON_TEST_PROFILE_DIR: profile }
});

try {
  const window = await shellWindow(application);
  await expect(window.getByLabel("Página inicial", { exact: true })).toBeVisible();
  await window.screenshot({ path: "assets/screenshots/page.png" });
  await window.getByLabel("Proteção e AdBlock").click();
  await expect(window.locator(".moon-drawer-title")).toHaveText("Proteção");
  await window.waitForTimeout(300);
  await window.screenshot({ path: "assets/screenshots/page1.png" });
  await window.getByLabel("Configurações", { exact: true }).click();
  await expect(window.getByRole("dialog")).toBeVisible();
  await window.screenshot({ path: "assets/screenshots/page2.png" });
} finally {
  await application.close();
  await rm(profile, { recursive: true, force: true });
}
