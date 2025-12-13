# Authentication

Anchor uses [@tijs/atproto-oauth](https://jsr.io/@tijs/atproto-oauth) for OAuth
authentication with AT Protocol.

## Quick Setup

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth";
import { SQLiteStorage } from "jsr:@tijs/atproto-storage";

const oauth = createATProtoOAuth({
  baseUrl: "https://dropanchor.app",
  cookieSecret: Deno.env.get("COOKIE_SECRET"),
  mobileScheme: "anchor-app://auth-callback",
  appName: "Anchor Location Feed",
  logoUri: "https://cdn.dropanchor.app/images/anchor-logo.png",
  policyUri: "https://dropanchor.app/privacy-policy",
  sessionTtl: 60 * 60 * 24 * 30, // 30 days for mobile
  storage: new SQLiteStorage(rawDb),
  logger: console,
});

// Mount OAuth routes
app.route("/", oauth.routes);
```

## Configuration

### Anchor-Specific Settings

| Setting           | Value                        | Purpose                    |
| ----------------- | ---------------------------- | -------------------------- |
| **Base URL**      | `https://dropanchor.app`     | Production backend URL     |
| **Mobile Scheme** | `anchor-app://auth-callback` | iOS app custom URL scheme  |
| **Session TTL**   | 30 days                      | Extended for mobile app UX |

### Environment Variables

- `COOKIE_SECRET` - Session encryption key (32+ characters, cryptographically
  random)
- `ANCHOR_BASE_URL` - Override base URL for development

## Authentication Methods

All authenticated endpoints support cookie-based authentication:

```http
Cookie: sid=<session-token>
```

Alternative Bearer token authentication (for compatibility):

```http
Authorization: Bearer <session-token>
```

> **Recommended**: Use cookie-based authentication. After OAuth, create an
> HTTPCookie and add it to HTTPCookieStorage (iOS) or document.cookie (web).

## Complete OAuth Documentation

For complete OAuth flow details, mobile integration, security considerations,
and implementation examples:

**📱
[Mobile OAuth Guide](https://jsr.io/@tijs/atproto-oauth/doc/docs/MOBILE_OAUTH)**
(Package documentation)

This guide includes:

- Complete OAuth flow with sequence diagrams
- All API endpoints with request/response schemas
- PKCE implementation details
- Session token format and cookie setup
- Error handling and recovery strategies
- iOS Swift and Android Kotlin examples
- Security best practices

## Authenticated API Endpoints

After authentication, use the session cookie to call authenticated endpoints:

### Create Check-in

```bash
curl -X POST "https://dropanchor.app/api/checkins" \
  -b "sid=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"place": {...}, "message": "Great spot!"}'
```

### Delete Check-in

```bash
curl -X DELETE "https://dropanchor.app/api/checkins/did:plc:abc/3k2abc" \
  -b "sid=YOUR_SESSION_TOKEN"
```

See [API Documentation](api-documentation.md) for complete endpoint reference.

## Mobile App Setup

The Anchor iOS app uses ASWebAuthenticationSession for OAuth:

1. **Load OAuth page**: `/mobile-auth`
2. **Complete OAuth**: Receive `anchor-app://auth-callback?session_token=...`
3. **Store token**: Save to iOS Keychain
4. **Create cookie**: Add to HTTPCookieStorage for URLSession
5. **Make requests**: All API calls automatically include cookie

See the
[Mobile OAuth Guide](https://jsr.io/@tijs/atproto-oauth/doc/docs/MOBILE_OAUTH)
for implementation details.

## Session Management

### Session Lifecycle

- **Duration**: 30 days
- **Refresh**: Automatic via backend
- **Expiration**: User must re-authenticate

### Session Validation

```typescript
const session = await oauth.validateSession(request);
if (!session.valid) {
  // User needs to re-authenticate
}
```

## Development

### Local Testing

For local development, override the base URL:

```bash
export ANCHOR_BASE_URL=http://localhost:8000
```

### Testing Authentication

1. Start the backend: `deno task dev`
2. Visit `/mobile-auth` in browser
3. Enter test handle: `test.bsky.social`
4. Complete OAuth flow

## Troubleshooting

### Session Invalid/Expired

- Clear cookies and re-authenticate
- Check `COOKIE_SECRET` is set correctly
- Verify session hasn't exceeded 30-day TTL

### Mobile OAuth Not Working

- Verify `mobileScheme` matches iOS app URL scheme
- Check callback URL format: `anchor-app://auth-callback`
- Ensure session_token is being stored in Keychain

### Token Refresh Issues

- Backend handles refresh automatically
- No manual refresh needed for cookie-based auth
- If refresh fails, user must re-authenticate

## Security

- **Session tokens** are sealed with Iron Session encryption
- **Cookies** use HttpOnly, Secure, and SameSite=Lax flags
- **PKCE** protects against authorization code interception
- **DPoP tokens** managed entirely on backend
- **No token exposure** in mobile app (only sealed session token)

See
[Security Considerations](https://jsr.io/@tijs/atproto-oauth/doc/docs/MOBILE_OAUTH#security-considerations)
in the Mobile OAuth Guide.

## Additional Resources

- [@tijs/atproto-oauth Package](https://jsr.io/@tijs/atproto-oauth)
- [Mobile OAuth Guide](https://jsr.io/@tijs/atproto-oauth/doc/docs/MOBILE_OAUTH)
- [AT Protocol OAuth](https://atproto.com/specs/oauth)
- [Anchor iOS App Source](https://github.com/dropanchorapp/Anchor)
