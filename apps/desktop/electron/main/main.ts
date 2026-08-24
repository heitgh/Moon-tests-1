import { app } from "electron";
import { join } from "node:path";
import { ElectronBrowserManager } from "../browser/browser-manager.js";
import { registerBrowserIpc } from "../ipc/browser-ipc.js";
import { IpcRouter } from "../ipc/ipc-router.js";
import { registerApplicationLifecycle } from "./app-lifecycle.js";
import { installApplicationMenu } from "./application-menu.js";
import { WindowManager } from "./window-manager.js";

const windows = new WindowManager();
const browser = new ElectronBrowserManager(windows);
const ipc = new IpcRouter();

async function createMainWindow(): Promise<void> {
  const appRoot = app.getAppPath();
  const id = windows.create({
    webPreferences: {
      preload: join(appRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });
  const window = windows.require(id);

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => {
    if (event.url !== window.webContents.getURL()) event.preventDefault();
  });
  window.once("close", () => { void browser.closeTabsForWindow(id); });
  await window.loadFile(join(appRoot, "index.html"));
}

app.whenReady().then(async () => {
  installApplicationMenu();
  registerBrowserIpc(ipc, browser, windows);
  registerApplicationLifecycle(windows, createMainWindow);
  await createMainWindow();
}).catch(error => {
  console.error("Moon failed to start", error);
  app.exit(1);
});

app.once("before-quit", () => ipc.dispose());
