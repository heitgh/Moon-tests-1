import { contextBridge, ipcRenderer } from "electron";
export interface MoonBridge { invoke<T>(channel: string, payload?: unknown): Promise<T>; on(channel: string, listener: (payload: unknown) => void): () => void; }
const allowedInvoke = new Set(["browser:create-tab", "browser:close-tab", "browser:navigate", "storage:get", "storage:set", "network:clear-cache", "system:show-item"]);
const allowedEvents = new Set(["browser:tab-updated", "browser:tab-closed", "download:progress"]);
export const moonBridge: MoonBridge = { invoke<T>(channel: string, payload?: unknown): Promise<T> { if (!allowedInvoke.has(channel)) return Promise.reject(new Error(`IPC channel is not allowed: ${channel}`)); return ipcRenderer.invoke(channel, payload) as Promise<T>; }, on(channel, listener) { if (!allowedEvents.has(channel)) throw new Error(`IPC event is not allowed: ${channel}`); const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); } };
export function exposeMoonBridge(): void { contextBridge.exposeInMainWorld("moon", Object.freeze(moonBridge)); }
