import type { ElectronAdblockService } from "../services/adblock-service.js";
import type { ElectronDownloadManager } from "../services/download-manager.js";
import type { IpcRouter } from "./ipc-router.js";
import { dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { parseMoonProfileBackup } from "../../../../packages/storage/backup/profile-backup.js";
import type { ProfileStorage } from "../services/profile-storage.js";

interface IdPayload { readonly id: string; }

export function registerProductIpc(
  router: IpcRouter,
  downloads: ElectronDownloadManager,
  adblock: ElectronAdblockService,
  profile: ProfileStorage
): void {
  const idFrom = (payload: IdPayload): string => {
    if (!payload || typeof payload.id !== "string" || payload.id.length > 100) {
      throw new TypeError("A valid ID is required");
    }
    return payload.id;
  };

  router.register("download:list", () => downloads.list());
  router.register("download:pause", (_event, payload: IdPayload) => downloads.pause(idFrom(payload)));
  router.register("download:resume", (_event, payload: IdPayload) => downloads.resume(idFrom(payload)));
  router.register("download:cancel", (_event, payload: IdPayload) => downloads.cancel(idFrom(payload)));
  router.register("download:open", (_event, payload: IdPayload) => downloads.open(idFrom(payload)));
  router.register("download:show-in-folder", (_event, payload: IdPayload) => downloads.showInFolder(idFrom(payload)));
  router.register("download:clear-finished", () => downloads.clearFinished());

  router.register("adblock:get-status", () => adblock.status());
  router.register("adblock:set-enabled", (_event, payload?: { readonly enabled?: boolean }) => {
    if (!payload || typeof payload.enabled !== "boolean") {
      throw new TypeError("An enabled value is required");
    }
    adblock.setEnabled(payload.enabled);
    return adblock.status();
  });

  router.register("product:export-data", async (_event, payload?: { readonly content?: string }) => {
    if (!payload || typeof payload.content !== "string" || payload.content.length > 5_000_000) {
      throw new TypeError("Invalid export content");
    }
    const canonicalContent = JSON.stringify(parseMoonProfileBackup(payload.content), null, 2);
    const result = await dialog.showSaveDialog({
      title: "Exportar dados do Moon",
      defaultPath: `moon-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "Moon backup", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, canonicalContent, { encoding: "utf8", mode: 0o600 });
    return true;
  });
  router.register("product:import-data", async () => {
    const result = await dialog.showOpenDialog({
      title: "Importar dados do Moon",
      properties: ["openFile"],
      filters: [{ name: "Moon backup", extensions: ["json"] }]
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const content = await readFile(path, "utf8");
    return JSON.stringify(parseMoonProfileBackup(content));
  });
  router.register("product:migrate-legacy-profile", (_event, payload?: { readonly content?: string }) => {
    if (!payload || typeof payload.content !== "string" || payload.content.length > 5_000_000) {
      throw new TypeError("Invalid legacy profile content");
    }
    return profile.migrateLegacyProfile(payload.content);
  });
}
