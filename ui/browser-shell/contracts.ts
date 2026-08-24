export interface Tab {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly active: boolean;
  readonly loading: boolean;
  readonly workspaceId?: string;
  readonly private: boolean;
}

export interface Navigation {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

export interface TabUpdate {
  readonly tab: Tab;
  readonly navigation: Navigation;
  readonly error?: string;
}

export interface Workspace { readonly id: string; readonly name: string; }
export interface SavedLink { readonly id: string; readonly title: string; readonly url: string; readonly time: number; }
export interface Shortcut { readonly id: string; readonly name: string; readonly url: string; }
export interface SavedTheme { readonly id: string; readonly name: string; readonly accent: string; readonly wallpaper: string; readonly glassHome: boolean; }
export type SearchEngine = "duckduckgo" | "google" | "brave";
export interface Preferences { readonly accent: string; readonly wallpaper: string; readonly searchEngine: SearchEngine; readonly showClock: boolean; readonly showShortcuts: boolean; readonly glassHome: boolean; }
export interface ManagedDownload { readonly id: string; readonly url: string; readonly filename: string; readonly savePath: string; readonly state: "in-progress" | "paused" | "completed" | "cancelled" | "failed"; readonly receivedBytes: number; readonly totalBytes: number; readonly speedBytesPerSecond: number; readonly percentage: number | null; readonly startedAt: number; readonly completedAt?: number; }
export interface AdblockStatus { readonly phase: "loading" | "active" | "disabled" | "failed"; readonly enabled: boolean; readonly blockedCount: number; readonly error?: string; }
export interface PermissionRequest { readonly id: string; readonly origin: string; readonly permission: string; }
export type Drawer = "workspaces" | "bookmarks" | "downloads" | "history" | "translate" | "notes" | "extensions" | "ai" | "security";

export interface MoonBrowserBridge {
  createTab(url?: string, workspaceId?: string): Promise<Tab>;
  getTabs(): Promise<readonly Tab[]>;
  closeTab(tabId: string): Promise<void>;
  activateTab(tabId: string): Promise<void>;
  showHome(tabId: string): Promise<void>;
  navigate(tabId: string, url: string): Promise<void>;
  back(tabId: string): Promise<void>;
  forward(tabId: string): Promise<void>;
  reload(tabId: string, bypassCache?: boolean): Promise<void>;
  stop(tabId: string): Promise<void>;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  setContentVisible(visible: boolean): Promise<void>;
  respondToPermission(requestId: string, granted: boolean): Promise<void>;
  getDownloads(): Promise<readonly ManagedDownload[]>;
  pauseDownload(id: string): Promise<void>;
  resumeDownload(id: string): Promise<void>;
  cancelDownload(id: string): Promise<void>;
  openDownload(id: string): Promise<void>;
  showDownloadInFolder(id: string): Promise<void>;
  clearFinishedDownloads(): Promise<void>;
  getAdblockStatus(): Promise<AdblockStatus>;
  setAdblockEnabled(enabled: boolean): Promise<AdblockStatus>;
  exportProductData(content: string): Promise<boolean>;
  importProductData(): Promise<string | null>;
  migrateLegacyProfile(content: string): Promise<{ readonly migrated: boolean; readonly version: number }>;
  onTabUpdated(listener: (update: TabUpdate) => void): () => void;
  onTabClosed(listener: (event: { readonly tabId: string }) => void): () => void;
  onDownloadsUpdated(listener: (downloads: readonly ManagedDownload[]) => void): () => void;
  onAdblockStatus(listener: (status: AdblockStatus) => void): () => void;
  onPermissionRequested(listener: (request: PermissionRequest) => void): () => void;
}

export function moonBrowserBridge(): MoonBrowserBridge | undefined {
  return (window as unknown as { readonly moonBrowser?: MoonBrowserBridge }).moonBrowser;
}
