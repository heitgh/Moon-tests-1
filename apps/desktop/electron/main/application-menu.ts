import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from "electron";
import { changeInterfaceZoom, type ZoomAction } from "./interface-zoom.js";

export function installApplicationMenu(): void {
  const zoomItem = (label: string, accelerator: string, action: ZoomAction): MenuItemConstructorOptions => ({
    label, accelerator,
    click: (_item, window) => { const browserWindow = window ? BrowserWindow.fromId(window.id) : BrowserWindow.getFocusedWindow(); if (browserWindow) changeInterfaceZoom(browserWindow.webContents, action); }
  });
  const template: MenuItemConstructorOptions[] = [
    { label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] },
    { label: "Editar", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }] },
    { label: "Visualizar", submenu: [
      { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" },
      zoomItem("Restaurar interface (100%)", "CommandOrControl+0", "reset"),
      zoomItem("Aumentar interface", "CommandOrControl+=", "in"),
      zoomItem("Diminuir interface", "CommandOrControl+-", "out"),
      { role: "togglefullscreen" }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
