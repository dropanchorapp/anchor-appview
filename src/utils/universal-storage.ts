// Universal storage providers for clean architecture testing
// Consolidates all storage interfaces and implementations

export interface CheckinData {
  id: string;
  uri: string;
  authorDid: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  latitude?: number;
  longitude?: number;
  addressRefUri?: string;
  addressRefCid?: string;
}

export interface AddressData {
  uri: string;
  cid?: string;
  name?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  fullData?: any;
  resolvedAt?: string;
  failedAt?: string;
}

export interface CheckinStorageProvider {
  getCheckin(id: string): Promise<CheckinData | null>;
  setCheckin(checkin: CheckinData): Promise<void>;
  checkinExists(id: string): Promise<boolean>;
  getCheckinsByAuthor(authorDid: string, limit?: number): Promise<CheckinData[]>;
  getAllCheckins(limit?: number): Promise<CheckinData[]>;
  ensureTablesExist(): Promise<void>;
}

export interface AddressStorageProvider {
  getAddress(uri: string): Promise<AddressData | null>;
  setAddress(address: AddressData): Promise<void>;
  getFailedAddresses(limit?: number): Promise<AddressData[]>;
  ensureTablesExist(): Promise<void>;
}

export interface BlobStorageProvider {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

// SQLite implementations for production
export class SqliteCheckinStorage implements CheckinStorageProvider {
  constructor(private sqlite: any) {}

  async getCheckin(id: string): Promise<CheckinData | null> {
    const result = await this.sqlite.execute(
      "SELECT * FROM checkins_v1 WHERE id = ?",
      [id]
    );

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return this.mapRowToCheckin(row);
    }
    return null;
  }

  async setCheckin(checkin: CheckinData): Promise<void> {
    await this.sqlite.execute(
      `INSERT OR REPLACE INTO checkins_v1 
       (id, uri, author_did, author_handle, text, created_at, latitude, longitude, address_ref_uri, address_ref_cid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        checkin.id,
        checkin.uri,
        checkin.authorDid,
        checkin.authorHandle,
        checkin.text,
        checkin.createdAt,
        checkin.latitude || null,
        checkin.longitude || null,
        checkin.addressRefUri || null,
        checkin.addressRefCid || null,
      ]
    );
  }

  async checkinExists(id: string): Promise<boolean> {
    const result = await this.sqlite.execute(
      "SELECT id FROM checkins_v1 WHERE id = ?",
      [id]
    );
    return result.rows && result.rows.length > 0;
  }

  async getCheckinsByAuthor(authorDid: string, limit: number = 50): Promise<CheckinData[]> {
    const result = await this.sqlite.execute(
      "SELECT * FROM checkins_v1 WHERE author_did = ? ORDER BY created_at DESC LIMIT ?",
      [authorDid, limit]
    );

    return (result.rows || []).map(row => this.mapRowToCheckin(row));
  }

  async getAllCheckins(limit: number = 50): Promise<CheckinData[]> {
    const result = await this.sqlite.execute(
      "SELECT * FROM checkins_v1 ORDER BY created_at DESC LIMIT ?",
      [limit]
    );

    return (result.rows || []).map(row => this.mapRowToCheckin(row));
  }

  async ensureTablesExist(): Promise<void> {
    await this.sqlite.execute(`
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
        indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private mapRowToCheckin(row: any): CheckinData {
    return {
      id: row.id,
      uri: row.uri,
      authorDid: row.author_did,
      authorHandle: row.author_handle,
      text: row.text,
      createdAt: row.created_at,
      latitude: row.latitude,
      longitude: row.longitude,
      addressRefUri: row.address_ref_uri,
      addressRefCid: row.address_ref_cid,
    };
  }
}

export class SqliteAddressStorage implements AddressStorageProvider {
  constructor(private sqlite: any) {}

  async getAddress(uri: string): Promise<AddressData | null> {
    const result = await this.sqlite.execute(
      "SELECT * FROM address_cache_v1 WHERE uri = ?",
      [uri]
    );

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return this.mapRowToAddress(row);
    }
    return null;
  }

  async setAddress(address: AddressData): Promise<void> {
    await this.sqlite.execute(
      `INSERT OR REPLACE INTO address_cache_v1 
       (uri, cid, name, street, locality, region, country, postal_code, latitude, longitude, full_data, resolved_at, failed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        address.uri,
        address.cid || null,
        address.name || null,
        address.street || null,
        address.locality || null,
        address.region || null,
        address.country || null,
        address.postalCode || null,
        address.latitude || null,
        address.longitude || null,
        address.fullData ? JSON.stringify(address.fullData) : null,
        address.resolvedAt || null,
        address.failedAt || null,
      ]
    );
  }

  async getFailedAddresses(limit: number = 50): Promise<AddressData[]> {
    const result = await this.sqlite.execute(
      "SELECT * FROM address_cache_v1 WHERE failed_at IS NOT NULL ORDER BY failed_at DESC LIMIT ?",
      [limit]
    );

    return (result.rows || []).map(row => this.mapRowToAddress(row));
  }

  async ensureTablesExist(): Promise<void> {
    await this.sqlite.execute(`
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
  }

  private mapRowToAddress(row: any): AddressData {
    return {
      uri: row.uri,
      cid: row.cid,
      name: row.name,
      street: row.street,
      locality: row.locality,
      region: row.region,
      country: row.country,
      postalCode: row.postal_code,
      latitude: row.latitude,
      longitude: row.longitude,
      fullData: row.full_data ? JSON.parse(row.full_data) : undefined,
      resolvedAt: row.resolved_at,
      failedAt: row.failed_at,
    };
  }
}

// In-memory implementations for testing
export class InMemoryCheckinStorage implements CheckinStorageProvider {
  private checkins: Map<string, CheckinData> = new Map();

  async getCheckin(id: string): Promise<CheckinData | null> {
    return this.checkins.get(id) || null;
  }

  async setCheckin(checkin: CheckinData): Promise<void> {
    this.checkins.set(checkin.id, checkin);
  }

  async checkinExists(id: string): Promise<boolean> {
    return this.checkins.has(id);
  }

  async getCheckinsByAuthor(authorDid: string, limit: number = 50): Promise<CheckinData[]> {
    return Array.from(this.checkins.values())
      .filter(checkin => checkin.authorDid === authorDid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async getAllCheckins(limit: number = 50): Promise<CheckinData[]> {
    return Array.from(this.checkins.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async ensureTablesExist(): Promise<void> {
    // No-op for in-memory storage
  }

  clear(): void {
    this.checkins.clear();
  }
}

export class InMemoryAddressStorage implements AddressStorageProvider {
  private addresses: Map<string, AddressData> = new Map();

  async getAddress(uri: string): Promise<AddressData | null> {
    return this.addresses.get(uri) || null;
  }

  async setAddress(address: AddressData): Promise<void> {
    this.addresses.set(address.uri, address);
  }

  async getFailedAddresses(limit: number = 50): Promise<AddressData[]> {
    return Array.from(this.addresses.values())
      .filter(address => address.failedAt)
      .sort((a, b) => (b.failedAt || '').localeCompare(a.failedAt || ''))
      .slice(0, limit);
  }

  async ensureTablesExist(): Promise<void> {
    // No-op for in-memory storage
  }

  clear(): void {
    this.addresses.clear();
  }
}

export class InMemoryBlobStorage implements BlobStorageProvider {
  private blobs: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.blobs.get(key) || null;
  }

  async set(key: string, value: any): Promise<void> {
    this.blobs.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    if (prefix) {
      return Array.from(this.blobs.keys()).filter(key => key.startsWith(prefix));
    }
    return Array.from(this.blobs.keys());
  }

  clear(): void {
    this.blobs.clear();
  }
}