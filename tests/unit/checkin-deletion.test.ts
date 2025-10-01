// Unit tests for checkin deletion business logic
// Tests rkey extraction, ownership verification, and deletion flow

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Test rkey extraction from AT URI (same as creation, but dedicated tests)
function extractRkey(uri: string): string | null {
  try {
    const parts = uri.split("/");
    const rkey = parts[parts.length - 1];
    return rkey && rkey.length > 0 ? rkey : null;
  } catch {
    return null;
  }
}

// Test ownership verification logic
function verifyOwnership(
  authenticatedDid: string,
  targetDid: string,
): { allowed: boolean; error?: string } {
  if (!authenticatedDid || !targetDid) {
    return { allowed: false, error: "Missing DID" };
  }

  if (authenticatedDid !== targetDid) {
    return {
      allowed: false,
      error: "Forbidden: Can only delete your own checkins",
    };
  }

  return { allowed: true };
}

// Test DID format validation
function isValidDid(did: string): boolean {
  return did.startsWith("did:") && did.length > 4;
}

Deno.test("Checkin Deletion - Extract rkey from checkin URI", () => {
  const uri =
    "at://did:plc:abc123xyz/app.dropanchor.checkin/3k2xyzhello1234567890";
  const rkey = extractRkey(uri);

  assertEquals(rkey, "3k2xyzhello1234567890");
});

Deno.test("Checkin Deletion - Extract rkey from address URI", () => {
  const uri =
    "at://did:plc:abc123xyz/community.lexicon.location.address/3k2abcdef";
  const rkey = extractRkey(uri);

  assertEquals(rkey, "3k2abcdef");
});

Deno.test("Checkin Deletion - Handle short rkey", () => {
  const uri = "at://did:plc:abc123xyz/app.dropanchor.checkin/3k";
  const rkey = extractRkey(uri);

  assertEquals(rkey, "3k");
});

Deno.test("Checkin Deletion - Handle long rkey", () => {
  const longRkey = "a".repeat(100);
  const uri = `at://did:plc:abc123xyz/app.dropanchor.checkin/${longRkey}`;
  const rkey = extractRkey(uri);

  assertEquals(rkey, longRkey);
});

Deno.test("Checkin Deletion - Reject empty rkey", () => {
  const uri = "at://did:plc:abc123xyz/app.dropanchor.checkin/";
  const rkey = extractRkey(uri);

  assertEquals(rkey, null);
});

Deno.test("Checkin Deletion - Handle URI with query parameters", () => {
  const uri =
    "at://did:plc:abc123xyz/app.dropanchor.checkin/3k2xyz?extra=param";
  const rkey = extractRkey(uri);

  // Should include query params in rkey (not ideal but matches current behavior)
  assertEquals(rkey, "3k2xyz?extra=param");
});

Deno.test("Checkin Deletion - Verify ownership with matching DIDs", () => {
  const authenticatedDid = "did:plc:abc123xyz";
  const targetDid = "did:plc:abc123xyz";

  const result = verifyOwnership(authenticatedDid, targetDid);

  assertEquals(result.allowed, true);
  assertEquals(result.error, undefined);
});

Deno.test("Checkin Deletion - Reject ownership with different DIDs", () => {
  const authenticatedDid = "did:plc:user1";
  const targetDid = "did:plc:user2";

  const result = verifyOwnership(authenticatedDid, targetDid);

  assertEquals(result.allowed, false);
  assertEquals(result.error, "Forbidden: Can only delete your own checkins");
});

Deno.test("Checkin Deletion - Reject ownership with missing authenticated DID", () => {
  const authenticatedDid = "";
  const targetDid = "did:plc:user1";

  const result = verifyOwnership(authenticatedDid, targetDid);

  assertEquals(result.allowed, false);
  assertEquals(result.error, "Missing DID");
});

Deno.test("Checkin Deletion - Reject ownership with missing target DID", () => {
  const authenticatedDid = "did:plc:user1";
  const targetDid = "";

  const result = verifyOwnership(authenticatedDid, targetDid);

  assertEquals(result.allowed, false);
  assertEquals(result.error, "Missing DID");
});

Deno.test("Checkin Deletion - Validate proper DID format", () => {
  assertEquals(isValidDid("did:plc:abc123xyz"), true);
  assertEquals(isValidDid("did:web:example.com"), true);
  assertEquals(isValidDid("did:key:z6MkhaXg..."), true);
});

Deno.test("Checkin Deletion - Reject invalid DID format (no prefix)", () => {
  assertEquals(isValidDid("abc123xyz"), false);
});

Deno.test("Checkin Deletion - Reject invalid DID format (wrong prefix)", () => {
  assertEquals(isValidDid("at://did:plc:abc123"), false);
});

Deno.test("Checkin Deletion - Reject empty DID", () => {
  assertEquals(isValidDid(""), false);
});

Deno.test("Checkin Deletion - Reject too-short DID", () => {
  assertEquals(isValidDid("did:"), false);
  assertEquals(isValidDid("did:a"), true); // Technically valid but very short
});

Deno.test("Checkin Deletion - Case sensitivity in ownership check", () => {
  const authenticatedDid = "did:plc:ABC123";
  const targetDid = "did:plc:abc123"; // Different case

  const result = verifyOwnership(authenticatedDid, targetDid);

  // DIDs are case-sensitive, so this should fail
  assertEquals(result.allowed, false);
  assertEquals(result.error, "Forbidden: Can only delete your own checkins");
});

Deno.test("Checkin Deletion - Ownership check with whitespace in DID", () => {
  const authenticatedDid = " did:plc:abc123 ";
  const targetDid = "did:plc:abc123";

  const result = verifyOwnership(authenticatedDid, targetDid);

  // Should fail due to whitespace (no trimming)
  assertEquals(result.allowed, false);
});

Deno.test("Checkin Deletion - Verify different DID methods", () => {
  // Two valid DIDs but different methods
  const authenticatedDid = "did:plc:abc123";
  const targetDid = "did:web:example.com";

  const result = verifyOwnership(authenticatedDid, targetDid);

  assertEquals(result.allowed, false);
  assertEquals(result.error, "Forbidden: Can only delete your own checkins");
});

// Test deletion flow state machine
type DeletionState = "pending" | "fetching_checkin" | "deleting" | "success" | "error";

function deletionFlowTransition(
  currentState: DeletionState,
  event: "start" | "fetch_success" | "fetch_error" | "delete_success" | "delete_error",
): DeletionState {
  switch (currentState) {
    case "pending":
      return event === "start" ? "fetching_checkin" : currentState;
    case "fetching_checkin":
      if (event === "fetch_success") return "deleting";
      if (event === "fetch_error") return "error";
      return currentState;
    case "deleting":
      if (event === "delete_success") return "success";
      if (event === "delete_error") return "error";
      return currentState;
    default:
      return currentState;
  }
}

Deno.test("Checkin Deletion - State flow: successful deletion", () => {
  let state: DeletionState = "pending";

  state = deletionFlowTransition(state, "start");
  assertEquals(state, "fetching_checkin");

  state = deletionFlowTransition(state, "fetch_success");
  assertEquals(state, "deleting");

  state = deletionFlowTransition(state, "delete_success");
  assertEquals(state, "success");
});

Deno.test("Checkin Deletion - State flow: fetch error", () => {
  let state: DeletionState = "pending";

  state = deletionFlowTransition(state, "start");
  assertEquals(state, "fetching_checkin");

  state = deletionFlowTransition(state, "fetch_error");
  assertEquals(state, "error");
});

Deno.test("Checkin Deletion - State flow: delete error", () => {
  let state: DeletionState = "pending";

  state = deletionFlowTransition(state, "start");
  assertEquals(state, "fetching_checkin");

  state = deletionFlowTransition(state, "fetch_success");
  assertEquals(state, "deleting");

  state = deletionFlowTransition(state, "delete_error");
  assertEquals(state, "error");
});

Deno.test("Checkin Deletion - State flow: invalid transition ignored", () => {
  let state: DeletionState = "pending";

  // Try to delete before starting
  state = deletionFlowTransition(state, "delete_success");
  assertEquals(state, "pending"); // Should stay in pending

  // Try to fetch after error
  state = "error";
  state = deletionFlowTransition(state, "fetch_success");
  assertEquals(state, "error"); // Should stay in error
});
