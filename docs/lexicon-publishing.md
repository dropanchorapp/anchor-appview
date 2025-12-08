# Publishing Anchor Lexicons

This document explains how to publish the `app.dropanchor.*` lexicons so they
can be discovered by tools like `glot` and other AT Protocol applications.

## Current Status

The Anchor lexicons are currently **local only** (not published). They work fine
for the app but aren't discoverable by external tools.

```bash
~/go/bin/glot status lexicons/
# 🟠 app.dropanchor.checkin   (local only)
# 🟠 app.dropanchor.comment   (local only)
# 🟠 app.dropanchor.like      (local only)
```

## Why Publish?

Publishing lexicons enables:

- Discovery by `glot` and other lexicon tools
- Interoperability with other apps that want to read/write Anchor data
- Validation of records against the published schema
- Documentation for developers building on Anchor

## Steps to Publish

### 1. Serve the DID Document

Create a route to serve `/.well-known/did.json`:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:dropanchor.app",
  "service": [
    {
      "id": "#lexicon",
      "type": "LexiconHost",
      "serviceEndpoint": "https://dropanchor.app/lexicons"
    }
  ]
}
```

This tells resolvers that lexicons for `dropanchor.app` are hosted at
`/lexicons`.

### 2. Serve Lexicon Files

Serve the lexicon JSON files at paths matching their NSID structure:

| Lexicon                  | URL                                                           |
| ------------------------ | ------------------------------------------------------------- |
| `app.dropanchor.checkin` | `https://dropanchor.app/lexicons/app/dropanchor/checkin.json` |
| `app.dropanchor.comment` | `https://dropanchor.app/lexicons/app/dropanchor/comment.json` |
| `app.dropanchor.like`    | `https://dropanchor.app/lexicons/app/dropanchor/like.json`    |

You can either:

- Copy the files to a static directory
- Serve them directly from the `lexicons/` folder in the repo

### 3. Add DNS TXT Record

Add a TXT record to the `dropanchor.app` domain:

```
_lexicon.dropanchor.app. IN TXT "did=did:web:dropanchor.app"
```

This tells lexicon resolvers how to find the DID document for the
`app.dropanchor` namespace.

### 4. Verify

After setup, verify with `glot`:

```bash
# Should resolve and show 🟢 (published, matches local)
~/go/bin/glot status lexicons/

# Should fetch and display the lexicon
~/go/bin/glot show app.dropanchor.checkin
```

## Implementation in Hono

Example route handlers for the backend:

```typescript
// /.well-known/did.json
app.get("/.well-known/did.json", (c) => {
  return c.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:web:dropanchor.app",
    "service": [
      {
        "id": "#lexicon",
        "type": "LexiconHost",
        "serviceEndpoint": "https://dropanchor.app/lexicons",
      },
    ],
  });
});

// /lexicons/* - serve lexicon files
app.get("/lexicons/*", async (c) => {
  const path = c.req.path.replace("/lexicons/", "");
  const filePath = `./lexicons/${path}`;

  try {
    const content = await Deno.readTextFile(filePath);
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: "Lexicon not found" }, 404);
  }
});
```

## NSID Resolution

When a tool resolves `app.dropanchor.checkin`:

1. Reverses domain parts: `app.dropanchor` → `dropanchor.app`
2. Looks up DNS TXT record: `_lexicon.dropanchor.app`
3. Gets DID: `did:web:dropanchor.app`
4. Fetches DID document: `https://dropanchor.app/.well-known/did.json`
5. Finds lexicon service endpoint: `https://dropanchor.app/lexicons`
6. Fetches lexicon:
   `https://dropanchor.app/lexicons/app/dropanchor/checkin.json`

## Community vs App Lexicons

- **Community lexicons** (`community.lexicon.*`) are shared schemas hosted at
  `lexicon.community` for interoperability between apps
- **App lexicons** (`app.dropanchor.*`) are app-specific schemas hosted on your
  own domain

Anchor uses community lexicons for location data (address, geo, fsq) embedded in
the app-specific checkin record.

## References

- [AT Protocol Lexicon Spec](https://atproto.com/specs/lexicon)
- [DID Web Method](https://w3c-ccg.github.io/did-method-web/)
- [glot CLI tool](https://tangled.org/bnewbold.net/cobalt)
- [Lexicon Community](https://github.com/lexicon-community/lexicon)
