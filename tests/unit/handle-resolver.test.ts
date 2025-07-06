import {
  assertEquals,
  assertRejects as _assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { restore, stub } from "https://deno.land/std@0.208.0/testing/mock.ts";

// Import the functions to test
import {
  batchResolveHandles,
  resolveHandle,
} from "../../src/utils/handle-resolver.ts";

Deno.test("Handle Resolver - resolveHandle success", async () => {
  // Mock fetch to return a successful response
  const _fetchStub = stub(globalThis, "fetch", () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          handle: "user.bsky.social",
        }),
        { status: 200 },
      ),
    );
  });

  try {
    const result = await resolveHandle("did:plc:test123");
    assertEquals(result, "user.bsky.social");
  } finally {
    restore();
  }
});

Deno.test("Handle Resolver - resolveHandle fallback to reverse lookup", async () => {
  let callCount = 0;
  const _fetchStub = stub(globalThis, "fetch", () => {
    callCount++;
    if (callCount === 1) {
      // First call fails
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    } else {
      // Second call (reverse lookup) succeeds
      return Promise.resolve(
        new Response(
          JSON.stringify({
            handle: "fallback.bsky.social",
          }),
          { status: 200 },
        ),
      );
    }
  });

  try {
    const result = await resolveHandle("did:plc:test123");
    assertEquals(result, "fallback.bsky.social");
    assertEquals(callCount, 2); // Should have made 2 calls
  } finally {
    restore();
  }
});

Deno.test("Handle Resolver - resolveHandle returns shortened DID on total failure", async () => {
  const _fetchStub = stub(globalThis, "fetch", () => {
    return Promise.resolve(new Response("Error", { status: 500 }));
  });

  try {
    const result = await resolveHandle("did:plc:abcdef123456");
    assertEquals(result, "abcdef12"); // Should return shortened DID
  } finally {
    restore();
  }
});

Deno.test("Handle Resolver - batchResolveHandles processes multiple DIDs", async () => {
  const _fetchStub = stub(globalThis, "fetch", (url: string) => {
    if (url.includes("did:plc:user1")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            handle: "user1.bsky.social",
          }),
          { status: 200 },
        ),
      );
    } else if (url.includes("did:plc:user2")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            handle: "user2.bsky.social",
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(new Response("Not Found", { status: 404 }));
  });

  try {
    const dids = ["did:plc:user1", "did:plc:user2"];
    const result = await batchResolveHandles(dids);

    assertEquals(result.size, 2);
    assertEquals(result.get("did:plc:user1"), "user1.bsky.social");
    assertEquals(result.get("did:plc:user2"), "user2.bsky.social");
  } finally {
    restore();
  }
});

Deno.test("Handle Resolver - batchResolveHandles handles rate limiting", async () => {
  const startTime = Date.now();

  const _fetchStub = stub(globalThis, "fetch", () => {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          handle: "test.bsky.social",
        }),
        { status: 200 },
      ),
    );
  });

  try {
    // Test with 6 DIDs (should create 2 batches of 5, with 1s delay)
    const dids = Array.from({ length: 6 }, (_, i) => `did:plc:user${i}`);
    await batchResolveHandles(dids);

    const duration = Date.now() - startTime;
    // Should take at least 1 second due to rate limiting between batches
    assertEquals(duration >= 1000, true);
  } finally {
    restore();
  }
});
