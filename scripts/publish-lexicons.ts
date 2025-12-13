/**
 * Publish lexicon schemas to a PDS as com.atproto.lexicon.schema records
 *
 * Usage: deno run --allow-net --allow-read --allow-env scripts/publish-lexicons.ts
 */

const HANDLE = Deno.env.get("HANDLE");
const APP_PASSWORD = Deno.env.get("APP_PASSWORD");

if (!HANDLE || !APP_PASSWORD) {
  console.error("Missing HANDLE or APP_PASSWORD env vars");
  Deno.exit(1);
}

const LEXICON_FILES = [
  "lexicons/app/dropanchor/checkin.json",
  "lexicons/app/dropanchor/like.json",
  "lexicons/app/dropanchor/comment.json",
];

async function resolveDid(handle: string): Promise<string> {
  const res = await fetch(
    `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
  );
  const data = await res.json();
  return data.did;
}

async function getPdsUrl(did: string): Promise<string> {
  const res = await fetch(`https://plc.directory/${did}`);
  const doc = await res.json();
  const pdsService = doc.service?.find((s: { id: string }) =>
    s.id === "#atproto_pds"
  );
  return pdsService?.serviceEndpoint;
}

async function createSession(
  pdsUrl: string,
  handle: string,
  password: string,
): Promise<{ accessJwt: string; did: string }> {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create session: ${error}`);
  }

  return res.json();
}

async function createLexiconRecord(
  pdsUrl: string,
  accessJwt: string,
  did: string,
  lexicon: Record<string, unknown>,
): Promise<void> {
  const nsid = lexicon.id as string;

  // The record format for com.atproto.lexicon.schema
  const record = {
    $type: "com.atproto.lexicon.schema",
    lexicon: lexicon.lexicon,
    id: lexicon.id,
    defs: lexicon.defs,
    description: (lexicon.defs as Record<string, { description?: string }>)
      ?.main?.description,
  };

  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({
      repo: did,
      collection: "com.atproto.lexicon.schema",
      rkey: nsid,
      record,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create record for ${nsid}: ${error}`);
  }

  const result = await res.json();
  console.log(`✅ Published ${nsid}`);
  console.log(`   URI: ${result.uri}`);
}

async function main() {
  console.log(`Resolving handle: ${HANDLE}`);
  const did = await resolveDid(HANDLE!);
  console.log(`DID: ${did}`);

  const pdsUrl = await getPdsUrl(did);
  console.log(`PDS: ${pdsUrl}`);

  console.log("\nAuthenticating...");
  const session = await createSession(pdsUrl, HANDLE!, APP_PASSWORD!);
  console.log("Session created\n");

  for (const file of LEXICON_FILES) {
    console.log(`Reading ${file}...`);
    const content = await Deno.readTextFile(file);
    const lexicon = JSON.parse(content);
    await createLexiconRecord(pdsUrl, session.accessJwt, session.did, lexicon);
  }

  console.log("\n🎉 All lexicons published!");
  console.log(
    `\nVerify with: ~/go/bin/glot status lexicons/`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  Deno.exit(1);
});
