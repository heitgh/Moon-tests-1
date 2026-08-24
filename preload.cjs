const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const subscribe = (channel, listener) => {
  if (typeof listener !== "function") throw new TypeError("Listener must be a function");
  const handler = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("moonBrowser", Object.freeze({
  createTab: (url, workspaceId) => invoke("browser:create-tab", {
    ...(url ? { url } : {}),
    ...(workspaceId ? { workspaceId } : {})
  }),
  getTabs: () => invoke("browser:get-tabs"),
  closeTab: tabId => invoke("browser:close-tab", { tabId }),
  activateTab: tabId => invoke("browser:activate-tab", { tabId }),
  showHome: tabId => invoke("browser:show-home", { tabId }),
  navigate: (tabId, url) => invoke("browser:navigate", { tabId, url }),
  back: tabId => invoke("browser:back", { tabId }),
  forward: tabId => invoke("browser:forward", { tabId }),
  reload: (tabId, bypassCache = false) => invoke("browser:reload", { tabId, bypassCache }),
  stop: tabId => invoke("browser:stop", { tabId }),
  setBounds: bounds => invoke("browser:set-bounds", bounds),
  setContentVisible: visible => invoke("browser:set-content-visible", { visible }),
  onTabUpdated: listener => subscribe("browser:tab-updated", listener),
  onTabClosed: listener => subscribe("browser:tab-closed", listener)
}));
