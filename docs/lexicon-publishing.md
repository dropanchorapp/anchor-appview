# Publishing Anchor Lexicons

This document explains how the `app.dropanchor.*` lexicons are published using
the AT Protocol's repository-based lexicon resolution.

## Current Status

The Anchor lexicons are **published** as AT Protocol records on the
dropanchor.app account:

```bash
goat lex status ./lexicons/
# 🟢 app.dropanchor.checkin
# 🟢 app.dropanchor.comment
# 🟢 app.dropanchor.like
```

## How It Works

Lexicons are published as `com.atproto.lexicon.schema` records in an AT Protocol
repository, following the official spec.

### Resolution Chain

1. **NSID**: `app.dropanchor.checkin`
2. **Reverse domain**: `dropanchor.app`
3. **DNS TXT lookup**: `_lexicon.dropanchor.app` →
   `did:plc:wxex3wx5k4ctciupsv5m5stb`
4. **DID resolves to PDS**: `https://leccinum.us-west.host.bsky.network`
5. **Fetch record**:
   `at://did:plc:wxex3wx5k4ctciupsv5m5stb/com.atproto.lexicon.schema/app.dropanchor.checkin`

### Published Records

| Lexicon                  | AT-URI                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `app.dropanchor.checkin` | `at://did:plc:wxex3wx5k4ctciupsv5m5stb/com.atproto.lexicon.schema/app.dropanchor.checkin` |
| `app.dropanchor.like`    | `at://did:plc:wxex3wx5k4ctciupsv5m5stb/com.atproto.lexicon.schema/app.dropanchor.like`    |
| `app.dropanchor.comment` | `at://did:plc:wxex3wx5k4ctciupsv5m5stb/com.atproto.lexicon.schema/app.dropanchor.comment` |

## Publishing Updates

To republish lexicons after making changes, use the goat CLI:

```bash
# Validate schemas first
goat lex parse ./lexicons/app/dropanchor/*.json

# Lint for best practices
goat lex lint ./lexicons/app/dropanchor/*.json

# Check current status
goat lex status ./lexicons/

# Login to dropanchor.app (create app password at bsky.app → Settings)
goat account login -u dropanchor.app -p <app-password>

# Publish
goat lex publish ./lexicons/

# Logout and revoke the app password
goat account logout
```

## DNS Configuration

The DNS TXT record maps the `app.dropanchor` namespace to a DID:

```
_lexicon.dropanchor.app. IN TXT "did=did:plc:wxex3wx5k4ctciupsv5m5stb"
```

This DID (`dropanchor.app` on Bluesky's hosted PDS) hosts the lexicon schema
records.

## Why This Approach?

The repository-based approach (vs HTTP file hosting) provides:

- **AT Protocol native**: Uses standard record types and resolution
- **Change detection**: Updates visible via the firehose
- **Portable**: Can migrate to another PDS if needed
- **Tooling**: Works with goat CLI for validation, linting, and publishing

## Verification

```bash
# Check DNS resolution
dig TXT _lexicon.dropanchor.app +short

# Check goat can resolve them
goat lex resolve app.dropanchor.checkin

# Check sync status
goat lex status ./lexicons/
goat lex check-dns ./lexicons/

# Fetch directly from PDS
curl -s "https://leccinum.us-west.host.bsky.network/xrpc/com.atproto.repo.getRecord?repo=did:plc:wxex3wx5k4ctciupsv5m5stb&collection=com.atproto.lexicon.schema&rkey=app.dropanchor.checkin" | jq .value.id
```

## References

- [AT Protocol Lexicon Spec](https://atproto.com/specs/lexicon)
- [Lexicon Garden](https://lexicon.garden) - Browse and discover AT Protocol
  lexicons
- [goat CLI](https://github.com/bluesky-social/indigo/tree/main/cmd/goat) -
  Official AT Protocol CLI tool
