/**
 * Fallback types for Val Town services when external types are unavailable
 * Used as backup when https://www.val.town/types/valtown.d.ts is unavailable
 */

declare module "https://esm.town/v/std/sqlite2" {
  export interface SQLiteExecuteResult {
    columns: string[];
    rows: any[][];
  }

  export interface SQLite {
    execute(
      options: { sql: string; args?: any[] },
    ): Promise<SQLiteExecuteResult>;
  }

  export const sqlite: SQLite;
}

declare module "https://esm.town/v/std/blob" {
  export interface Blob {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
  }

  export const blob: Blob;
}

declare module "https://esm.town/v/std/utils*" {
  export function serveFile(path: string, base: string): Promise<Response>;
}
