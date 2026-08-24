import type { MoonDatabase } from "../database/database.js";
import { JsonRepository } from "./json-repository.js";
export interface ThemeRecord { readonly id: string; readonly name: string; readonly tokens: string; readonly builtin: boolean; readonly createdAt: number; readonly updatedAt: number; }
export class ThemeRepository extends JsonRepository<ThemeRecord> {
  constructor(database: MoonDatabase) { super(database, "themes"); }
  async list() { return [...await this.all()].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)); }
  async removeCustom(id: string): Promise<boolean> { const theme = await this.get(id); if (!theme || theme.builtin) return false; return this.delete(id); }
}
