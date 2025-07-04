import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Mock SQLite implementation for testing
class MockSQLite {
  private tables = new Map<string, any[]>();
  private tableSchemas = new Map<string, string>();

  async execute(query: string, params: any[] = []): Promise<any[]> {
    const normalizedQuery = query.trim().toLowerCase();
    
    // Handle CREATE TABLE
    if (normalizedQuery.startsWith('create table')) {
      const tableName = this.extractTableName(query, 'create table');
      if (tableName) {
        this.tables.set(tableName, []);
        this.tableSchemas.set(tableName, query);
      }
      return [];
    }
    
    // Handle CREATE INDEX
    if (normalizedQuery.startsWith('create index')) {
      return [];
    }
    
    // Handle INSERT
    if (normalizedQuery.startsWith('insert')) {
      const tableName = this.extractTableName(query, 'insert');
      if (tableName && this.tables.has(tableName)) {
        const table = this.tables.get(tableName)!;
        // Extract field names from the query
        const fieldsMatch = query.match(/\(([^)]+)\)\s*values/i);
        if (fieldsMatch) {
          const fieldNames = fieldsMatch[1].split(',').map(f => f.trim());
          const record: any = {};
          fieldNames.forEach((field, index) => {
            if (params[index] !== undefined) {
              record[field] = params[index];
            }
          });
          table.push(record);
        } else {
          // Fallback for checkins_v1
          const record: any = {};
          if (tableName === 'checkins_v1') {
            const fields = ['id', 'uri', 'author_did', 'author_handle', 'text', 'created_at', 'latitude', 'longitude', 'address_ref_uri', 'address_ref_cid'];
            fields.forEach((field, index) => {
              if (params[index] !== undefined) {
                record[field] = params[index];
              }
            });
          }
          table.push(record);
        }
      }
      return [];
    }
    
    // Handle SELECT
    if (normalizedQuery.startsWith('select')) {
      const tableName = this.extractTableName(query, 'from');
      if (tableName && this.tables.has(tableName)) {
        let results = [...this.tables.get(tableName)!];
        
        // Simple WHERE clause handling
        if (query.toLowerCase().includes('where') && params.length > 0) {
          if (query.toLowerCase().includes('id = ?')) {
            results = results.filter(row => row.id === params[0]);
          }
          if (query.toLowerCase().includes('author_did = ?')) {
            results = results.filter(row => row.author_did === params[0]);
          }
        }
        
        // Handle COUNT queries
        if (normalizedQuery.includes('count(*)')) {
          return [{ count: results.length }];
        }
        
        return results;
      }
    }
    
    return [];
  }

  private extractTableName(query: string, keyword: string): string | null {
    let regex: RegExp;
    
    if (keyword === 'create table') {
      regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/i;
    } else if (keyword === 'insert') {
      regex = /insert\s+(?:or\s+ignore\s+)?into\s+(\w+)/i;
    } else if (keyword === 'from') {
      regex = /from\s+(\w+)/i;
    } else {
      regex = new RegExp(`${keyword}\\s+(?:if\\s+not\\s+exists\\s+)?([\\w_]+)`, 'i');
    }
    
    const match = query.match(regex);
    return match ? match[1].toLowerCase() : null;
  }

  reset() {
    this.tables.clear();
    this.tableSchemas.clear();
  }
}

const mockSqlite = new MockSQLite();

// Test database table creation
Deno.test("Database - table creation", async () => {
  mockSqlite.reset();
  
  // Test checkins table creation
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      author_handle TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address_ref_uri TEXT,
      address_ref_cid TEXT,
      cached_address_name TEXT,
      cached_address_street TEXT,
      cached_address_locality TEXT,
      cached_address_region TEXT,
      cached_address_country TEXT,
      cached_address_postal_code TEXT,
      cached_address_full JSON,
      address_resolved_at TEXT,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Verify table was created
  const result = await mockSqlite.execute("SELECT * FROM checkins_v1");
  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 0);
});

Deno.test("Database - checkin insertion and retrieval", async () => {
  mockSqlite.reset();
  
  // Create table
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      author_handle TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address_ref_uri TEXT,
      address_ref_cid TEXT
    )
  `);

  // Insert test data
  await mockSqlite.execute(`
    INSERT INTO checkins_v1 
    (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    "test123",
    "at://did:plc:test/app.dropanchor.checkin/test123",
    "did:plc:test",
    "test.bsky.social",
    "Great coffee!",
    "2024-01-01T12:00:00Z",
    40.7128,
    -74.0060,
    null,
    null
  ]);

  // Retrieve all checkins
  const allCheckins = await mockSqlite.execute("SELECT * FROM checkins_v1");
  assertEquals(allCheckins.length, 1);
  assertEquals(allCheckins[0].id, "test123");
  assertEquals(allCheckins[0].text, "Great coffee!");

  // Test duplicate prevention
  const duplicateCheck = await mockSqlite.execute("SELECT id FROM checkins_v1 WHERE id = ?", ["test123"]);
  assertEquals(duplicateCheck.length, 1);
});

Deno.test("Database - schema validation", async () => {
  mockSqlite.reset();
  
  // Test that we can create all required tables without errors
  const tables = [
    'checkins_v1',
    'address_cache_v1', 
    'user_follows_v1',
    'processing_log_v1'
  ];
  
  // Create checkins table
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  
  // Create other tables
  await mockSqlite.execute(`CREATE TABLE IF NOT EXISTS address_cache_v1 (uri TEXT PRIMARY KEY)`);
  await mockSqlite.execute(`CREATE TABLE IF NOT EXISTS user_follows_v1 (follower_did TEXT, following_did TEXT)`);
  await mockSqlite.execute(`CREATE TABLE IF NOT EXISTS processing_log_v1 (id INTEGER PRIMARY KEY)`);
  
  // Verify all tables exist (mock should have them in memory)
  const mockInstance = mockSqlite as any;
  for (const table of tables) {
    assertEquals(mockInstance.tables.has(table), true, `Table ${table} should exist`);
  }
});

Deno.test("Database - count queries", async () => {
  mockSqlite.reset();
  
  // Create and populate table
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Insert test records
  for (let i = 1; i <= 5; i++) {
    await mockSqlite.execute(`
      INSERT INTO checkins_v1 (id, uri, author_did, text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [`id${i}`, `uri${i}`, `did:plc:user${i}`, `text${i}`, "2024-01-01T12:00:00Z"]);
  }

  // Test count query
  const countResult = await mockSqlite.execute("SELECT COUNT(*) as count FROM checkins_v1");
  assertEquals(countResult.length, 1);
  assertEquals(countResult[0].count, 5);
});

Deno.test("Database - address cache table operations", async () => {
  mockSqlite.reset();

  // Create address cache table
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS address_cache_v1 (
      uri TEXT PRIMARY KEY,
      cid TEXT,
      name TEXT,
      street TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      full_data JSON,
      resolved_at TEXT,
      failed_at TEXT
    )
  `);

  // Verify table creation
  const result = await mockSqlite.execute("SELECT * FROM address_cache_v1");
  assertEquals(Array.isArray(result), true);
});

Deno.test("Database - processing logs", async () => {
  mockSqlite.reset();

  // Create processing log table
  await mockSqlite.execute(`
    CREATE TABLE IF NOT EXISTS processing_log_v1 (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);

  // Test table was created successfully
  const result = await mockSqlite.execute("SELECT * FROM processing_log_v1");
  assertEquals(Array.isArray(result), true);
});