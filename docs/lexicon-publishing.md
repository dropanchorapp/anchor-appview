# Publishing Anchor Lexicons

This document explains how the `app.dropanchor.*` lexicons are published using
the AT Protocol's repository-based lexicon resolution.

## Current Status

The Anchor lexicons are **published** as AT Protocol records on hamster.farm:

```bash
~/go/bin/glot status lexicons/
# 🟣 app.dropanchor.checkin
# 🟣 app.dropanchor.comment
# 🟣 app.dropanchor.like
```

## How It Works

Lexicons are published as `com.atproto.lexicon.schema` records in an AT Protocol
repository, following the official spec.

### Resolution Chain

1. **NSID**: `app.dropanchor.checkin`
2. **Reverse domain**: `dropanchor.app`
3. **DNS TXT lookup**: `_lexicon.dropanchor.app` →
   `did:plc:aq7owa5y7ndc2hzjz37wy7ma`
4. **DID resolves to PDS**: `https://hamster.farm`
5. **Fetch record**:
   `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.checkin`

### Published Records

| Lexicon                  | AT-URI                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `app.dropanchor.checkin` | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.checkin` |
| `app.dropanchor.like`    | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.like`    |
| `app.dropanchor.comment` | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.comment` |

## Publishing Updates

To republish lexicons after making changes:

```bash
# Set credentials
export HANDLE=tijs.org
export APP_PASSWORD=your-app-password

# Run the publish script
deno run --allow-net --allow-read --allow-env scripts/publish-lexicons.ts
```

The script uses `putRecord` so it will update existing records.

## DNS Configuration

The DNS TXT record maps the `app.dropanchor` namespace to a DID:

```
_lexicon.dropanchor.app. IN TXT "did=did:plc:aq7owa5y7ndc2hzjz37wy7ma"
```

This DID (`tijs.org` on hamster.farm) hosts the lexicon schema records.

## Why This Approach?

The repository-based approach (vs HTTP file hosting) provides:

- **Self-hosted**: Lexicons live on hamster.farm, fully under our control
- **AT Protocol native**: Uses standard record types and resolution
- **Change detection**: Updates visible via the firehose
- **Portable**: Can migrate to another PDS if needed

## Verification

```bash
# Check DNS resolution
dig TXT _lexicon.dropanchor.app +short

# Check glot can find them
~/go/bin/glot status lexicons/
~/go/bin/glot check-dns lexicons/

# Fetch directly from PDS
curl -s "https://hamster.farm/xrpc/com.atproto.repo.getRecord?repo=did:plc:aq7owa5y7ndc2hzjz37wy7ma&collection=com.atproto.lexicon.schema&rkey=app.dropanchor.checkin" | jq .value.id
```

## References

- [AT Protocol Lexicon Spec](https://atproto.com/specs/lexicon)
- [Lexicon Resolution RFC](https://github.com/bluesky-social/atproto/discussions/3074)
