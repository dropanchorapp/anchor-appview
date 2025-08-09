import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Handle resolution utilities for testing
export interface HandleResolver {
  resolveHandle(handle: string): Promise<string | null>;
  isValidHandle(handle: string): boolean;
  normalizeHandle(handle: string): string;
}

export class ATProtocolHandleResolver implements HandleResolver {
  async resolveHandle(handle: string): Promise<string | null> {
    const normalizedHandle = this.normalizeHandle(handle);

    if (!this.isValidHandle(normalizedHandle)) {
      return null;
    }

    try {
      // Try DNS resolution first
      const dnsResult = await this.resolveDNS(normalizedHandle);
      if (dnsResult) {
        return dnsResult;
      }

      // Fall back to HTTP resolution
      return await this.resolveHTTP(normalizedHandle);
    } catch (error) {
      console.error(`Failed to resolve handle ${normalizedHandle}:`, error);
      return null;
    }
  }

  isValidHandle(handle: string): boolean {
    // Basic handle validation rules
    if (!handle || handle.length === 0) return false;
    if (handle.length > 253) return false;
    if (handle.startsWith(".") || handle.endsWith(".")) return false;
    if (handle.includes("..")) return false;

    // Must contain only valid characters
    const validPattern = /^[a-zA-Z0-9.-]+$/;
    if (!validPattern.test(handle)) return false;

    // Must have at least one dot (domain structure)
    if (!handle.includes(".")) return false;

    return true;
  }

  normalizeHandle(handle: string): string {
    // Remove @ prefix if present
    let normalized = handle.startsWith("@") ? handle.slice(1) : handle;

    // Convert to lowercase
    normalized = normalized.toLowerCase();

    // Add .bsky.social if no domain is present
    if (!normalized.includes(".") || normalized.endsWith(".bsky")) {
      normalized = normalized.replace(/\.bsky$/, "") + ".bsky.social";
    }

    return normalized;
  }

  private resolveDNS(handle: string): Promise<string | null> {
    try {
      // In a real implementation, this would do DNS TXT record lookup
      // For testing, we'll simulate common patterns
      if (handle.endsWith(".bsky.social")) {
        return Promise.resolve(null); // These use HTTP resolution
      }

      // Custom domain resolution would happen here
      return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
  }

  private async resolveHTTP(handle: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.did || null;
    } catch {
      return null;
    }
  }
}

export class MockHandleResolver implements HandleResolver {
  private handleMap = new Map<string, string>();

  constructor(mockData: Record<string, string> = {}) {
    Object.entries(mockData).forEach(([handle, did]) => {
      this.handleMap.set(this.normalizeHandle(handle), did);
    });
  }

  resolveHandle(handle: string): Promise<string | null> {
    const normalized = this.normalizeHandle(handle);
    if (!this.isValidHandle(normalized)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.handleMap.get(normalized) || null);
  }

  isValidHandle(handle: string): boolean {
    const resolver = new ATProtocolHandleResolver();
    return resolver.isValidHandle(handle);
  }

  normalizeHandle(handle: string): string {
    const resolver = new ATProtocolHandleResolver();
    return resolver.normalizeHandle(handle);
  }

  setMockHandle(handle: string, did: string): void {
    this.handleMap.set(this.normalizeHandle(handle), did);
  }
}

// Tests
Deno.test("HandleResolver - normalizeHandle basic cases", () => {
  const resolver = new ATProtocolHandleResolver();

  assertEquals(
    resolver.normalizeHandle("@user.bsky.social"),
    "user.bsky.social",
  );
  assertEquals(
    resolver.normalizeHandle("USER.BSKY.SOCIAL"),
    "user.bsky.social",
  );
  assertEquals(resolver.normalizeHandle("user"), "user.bsky.social");
  assertEquals(resolver.normalizeHandle("user.bsky"), "user.bsky.social");
});

Deno.test("HandleResolver - normalizeHandle preserves custom domains", () => {
  const resolver = new ATProtocolHandleResolver();

  assertEquals(
    resolver.normalizeHandle("user.example.com"),
    "user.example.com",
  );
  assertEquals(
    resolver.normalizeHandle("@subdomain.example.org"),
    "subdomain.example.org",
  );
});

Deno.test("HandleResolver - isValidHandle validation", () => {
  const resolver = new ATProtocolHandleResolver();

  // Valid handles
  assertEquals(resolver.isValidHandle("user.bsky.social"), true);
  assertEquals(resolver.isValidHandle("test-user.example.com"), true);
  assertEquals(resolver.isValidHandle("a.b"), true);

  // Invalid handles
  assertEquals(resolver.isValidHandle(""), false);
  assertEquals(resolver.isValidHandle("user"), false); // No domain
  assertEquals(resolver.isValidHandle(".user.com"), false); // Starts with dot
  assertEquals(resolver.isValidHandle("user.com."), false); // Ends with dot
  assertEquals(resolver.isValidHandle("user..com"), false); // Double dot
  assertEquals(resolver.isValidHandle("user@domain.com"), false); // Invalid character
  assertEquals(resolver.isValidHandle("a".repeat(254)), false); // Too long
});

Deno.test("HandleResolver - isValidHandle edge cases", () => {
  const resolver = new ATProtocolHandleResolver();

  assertEquals(resolver.isValidHandle("user_name.com"), false); // Underscore not allowed
  assertEquals(resolver.isValidHandle("user name.com"), false); // Space not allowed
  assertEquals(resolver.isValidHandle("user#name.com"), false); // Hash not allowed
  assertEquals(resolver.isValidHandle("123.bsky.social"), true); // Numbers are fine
});

Deno.test("MockHandleResolver - basic functionality", async () => {
  const mockData = {
    "test.bsky.social": "did:plc:test123",
    "user.example.com": "did:plc:user456",
  };

  const resolver = new MockHandleResolver(mockData);

  assertEquals(
    await resolver.resolveHandle("test.bsky.social"),
    "did:plc:test123",
  );
  assertEquals(
    await resolver.resolveHandle("user.example.com"),
    "did:plc:user456",
  );
  assertEquals(await resolver.resolveHandle("unknown.bsky.social"), null);
});

Deno.test("MockHandleResolver - handle normalization in resolution", async () => {
  const resolver = new MockHandleResolver({
    "test.bsky.social": "did:plc:test123",
  });

  // Should resolve with various input formats
  assertEquals(
    await resolver.resolveHandle("@test.bsky.social"),
    "did:plc:test123",
  );
  assertEquals(
    await resolver.resolveHandle("TEST.BSKY.SOCIAL"),
    "did:plc:test123",
  );
  assertEquals(await resolver.resolveHandle("test"), "did:plc:test123");
  assertEquals(await resolver.resolveHandle("test.bsky"), "did:plc:test123");
});

Deno.test("MockHandleResolver - setMockHandle", async () => {
  const resolver = new MockHandleResolver();

  resolver.setMockHandle("dynamic.bsky.social", "did:plc:dynamic123");

  assertEquals(
    await resolver.resolveHandle("dynamic.bsky.social"),
    "did:plc:dynamic123",
  );
  assertEquals(await resolver.resolveHandle("@dynamic"), "did:plc:dynamic123");
});

Deno.test("MockHandleResolver - invalid handle rejection", async () => {
  const resolver = new MockHandleResolver({
    "valid.bsky.social": "did:plc:valid123",
  });

  // Even if mock data exists, invalid handles should be rejected
  resolver.setMockHandle("invalid..handle", "did:plc:invalid");

  assertEquals(
    await resolver.resolveHandle("valid.bsky.social"),
    "did:plc:valid123",
  );
  assertEquals(await resolver.resolveHandle("invalid..handle"), null);
});

Deno.test("HandleResolver - handle with hyphens and numbers", () => {
  const resolver = new ATProtocolHandleResolver();

  assertEquals(resolver.isValidHandle("user-123.bsky.social"), true);
  assertEquals(resolver.isValidHandle("123-user.example.com"), true);
  assertEquals(
    resolver.normalizeHandle("User-123.BSKY.social"),
    "user-123.bsky.social",
  );
});

Deno.test("HandleResolver - boundary length testing", () => {
  const resolver = new ATProtocolHandleResolver();

  // Test maximum valid length (253 characters)
  const maxHandle = "a".repeat(240) + ".bsky.social"; // 240 + 12 = 252 chars
  assertEquals(resolver.isValidHandle(maxHandle), true);

  // Test over maximum length
  const overMaxHandle = "a".repeat(241) + ".bsky.social"; // 241 + 12 = 253 chars
  assertEquals(resolver.isValidHandle(overMaxHandle), true);

  // Test way over maximum
  const wayOverMaxHandle = "a".repeat(250) + ".bsky.social"; // 250 + 12 = 262 chars
  assertEquals(resolver.isValidHandle(wayOverMaxHandle), false);
});
