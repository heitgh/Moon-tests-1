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
  getDownloads: () => invoke("download:list"),
  pauseDownload: id => invoke("download:pause", { id }),
  resumeDownload: id => invoke("download:resume", { id }),
  cancelDownload: id => invoke("download:cancel", { id }),
  openDownload: id => invoke("download:open", { id }),
  showDownloadInFolder: id => invoke("download:show-in-folder", { id }),
  clearFinishedDownloads: () => invoke("download:clear-finished"),
  getAdblockStatus: () => invoke("adblock:get-status"),
  setAdblockEnabled: enabled => invoke("adblock:set-enabled", { enabled }),
  onTabUpdated: listener => subscribe("browser:tab-updated", listener),
  onTabClosed: listener => subscribe("browser:tab-closed", listener),
  onDownloadsUpdated: listener => subscribe("download:updated", listener),
  onAdblockStatus: listener => subscribe("adblock:status", listener)
}));
