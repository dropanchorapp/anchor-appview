// Mock SQLite implementation for testing
// Provides in-memory database functionality without requiring Val Town authentication

export class MockSQLite {
  private tables: Map<string, any[]> = new Map();
  private schemas: Map<string, string> = new Map();

  execute(query: string, params?: any[]): Promise<{ rows?: any[] }> {
    const normalizedQuery = query.trim().toLowerCase();

    // Handle CREATE TABLE
    if (normalizedQuery.startsWith("create table")) {
      const tableName = this.extractTableName(query);
      if (tableName) {
        this.tables.set(tableName, []);
        this.schemas.set(tableName, query);
      }
      return Promise.resolve({ rows: [] });
    }

    // Handle CREATE INDEX
    if (normalizedQuery.startsWith("create index")) {
      return Promise.resolve({ rows: [] });
    }

    // Handle INSERT
    if (normalizedQuery.startsWith("insert")) {
      const tableName = this.extractTableNameFromInsert(query);
      if (tableName && params) {
        const table = this.tables.get(tableName) || [];
        const columns = this.extractColumnsFromInsert(query);
        const row: any = {};

        columns.forEach((col, index) => {
          row[col] = params[index];
        });

        table.push(row);
        this.tables.set(tableName, table);
      }
      return Promise.resolve({ rows: [] });
    }

    // Handle SELECT
    if (normalizedQuery.startsWith("select")) {
      const tableName = this.extractTableNameFromSelect(query);
      if (tableName) {
        let table = this.tables.get(tableName) || [];

        // Apply WHERE clause if present
        if (normalizedQuery.includes("where") && params) {
          table = this.applyWhereClause(table, query, params);
        }

        // Apply ORDER BY if present
        if (normalizedQuery.includes("order by")) {
          table = this.applyOrderBy(table, query);
        }

        // Apply LIMIT if present
        if (normalizedQuery.includes("limit")) {
          table = this.applyLimit(table, query, params);
        }

        return Promise.resolve({ rows: table });
      }
      return Promise.resolve({ rows: [] });
    }

    // Handle COUNT queries
    if (normalizedQuery.includes("count(*)")) {
      const tableName = this.extractTableNameFromSelect(query);
      if (tableName) {
        const table = this.tables.get(tableName) || [];
        return Promise.resolve({ rows: [{ count: table.length }] });
      }
      return Promise.resolve({ rows: [{ count: 0 }] });
    }

    // Handle DELETE
    if (normalizedQuery.startsWith("delete")) {
      const tableName = this.extractTableNameFromDelete(query);
      if (tableName) {
        this.tables.set(tableName, []);
      }
      return Promise.resolve({ rows: [] });
    }

    // Handle UPDATE
    if (normalizedQuery.startsWith("update")) {
      const tableName = this.extractTableNameFromUpdate(query);
      if (tableName && params) {
        const table = this.tables.get(tableName) || [];
        // Simple UPDATE implementation - update all rows for testing
        table.forEach((row) => {
          if (query.includes("SET author_handle =")) {
            row.author_handle = params[0];
          }
        });
        this.tables.set(tableName, table);
      }
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [] });
  }

  private extractTableName(query: string): string | null {
    const match = query.match(/create table if not exists\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractTableNameFromInsert(query: string): string | null {
    const match = query.match(/insert (?:or ignore )?into\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractTableNameFromSelect(query: string): string | null {
    const match = query.match(/from\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractTableNameFromDelete(query: string): string | null {
    const match = query.match(/delete from\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractTableNameFromUpdate(query: string): string | null {
    const match = query.match(/update\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractColumnsFromInsert(query: string): string[] {
    const match = query.match(/\(([^)]+)\)/);
    if (match) {
      return match[1].split(",").map((col) => col.trim());
    }
    return [];
  }

  private applyWhereClause(table: any[], query: string, params: any[]): any[] {
    const normalizedQuery = query.toLowerCase();

    if (normalizedQuery.includes("where did =")) {
      const did = params[0];
      return table.filter((row) => row.did === did);
    }

    if (normalizedQuery.includes("where author_did =")) {
      const did = params[0];
      return table.filter((row) => row.author_did === did);
    }

    if (normalizedQuery.includes("where id =")) {
      const id = params[0];
      return table.filter((row) => row.id === id);
    }

    if (normalizedQuery.includes("where fetched_at <")) {
      const threshold = params[0];
      return table.filter((row) => row.fetched_at < threshold);
    }

    return table;
  }

  private applyOrderBy(table: any[], query: string): any[] {
    const normalizedQuery = query.toLowerCase();

    if (normalizedQuery.includes("order by created_at desc")) {
      return [...table].sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || "")
      );
    }

    if (normalizedQuery.includes("order by fetched_at asc")) {
      return [...table].sort((a, b) =>
        (a.fetched_at || "").localeCompare(b.fetched_at || "")
      );
    }

    return table;
  }

  private applyLimit(table: any[], query: string, params?: any[]): any[] {
    const match = query.match(/limit\s+(\d+|\?)/i);
    if (match) {
      const limit = match[1] === "?"
        ? params?.[params.length - 1]
        : parseInt(match[1]);
      return table.slice(0, limit);
    }
    return table;
  }

  // Helper method to clear all data
  clear() {
    this.tables.clear();
    this.schemas.clear();
  }
}

// Export singleton instance
export const mockSqlite = new MockSQLite();
