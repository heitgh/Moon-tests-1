import { contextBridge } from "electron";
export interface SecurityBridge { readonly platform: "desktop"; readonly isolated: true; sanitizeExternalUrl(value: string): string | null; }
export function exposeSecurityBridge(): void { const bridge: SecurityBridge = { platform: "desktop", isolated: true, sanitizeExternalUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; } } }; contextBridge.exposeInMainWorld("moonSecurity", Object.freeze(bridge)); }
