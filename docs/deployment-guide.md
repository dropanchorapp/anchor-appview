# Anchor AppView Deployment Guide

## Prerequisites

- [Deno](https://deno.land/) installed locally
- Git access to the repository
- Deno Deploy project linked to the repository

## Architecture

Anchor is a Fresh 2 application (`main.ts`) that serves both the API and the
React frontend. It deploys to Deno Deploy and auto-deploys on push to `main`.

## Deployment

Pushing to `main` triggers an automatic deploy via the Deno Deploy GitHub
integration:

```bash
git push origin main
```

## Environment Variables

Set these in the Deno Deploy dashboard:

| Variable               | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `COOKIE_SECRET`        | Iron Session encryption key                       |
| `ANCHOR_BASE_URL`      | Public URL (defaults to `https://dropanchor.app`) |
| `BUNNY_STORAGE_ZONE`   | Bunny CDN storage zone name                       |
| `BUNNY_STORAGE_KEY`    | Bunny CDN API key                                 |
| `BUNNY_STORAGE_REGION` | Bunny CDN region                                  |
| `BUNNY_CDN_URL`        | CDN base URL (e.g., `https://cdn.dropanchor.app`) |
| `TURSO_DATABASE_URL`   | Turso/libSQL database URL                         |
| `SENTRY_DSN`           | Sentry error tracking DSN (optional)              |

## Quality Checks

Before pushing, run the full quality suite:

```bash
deno task quality
```

This runs formatting, linting, type checking, and tests.

## Testing the Deployment

```bash
# Health check
curl https://dropanchor.app/api/stats

# Test nearby API
curl "https://dropanchor.app/api/nearby?lat=52.0705&lng=4.3007&radius=5&limit=5"
```

## API Endpoints

The deployed AppView provides:

- **Nearby Feed**: Location-based spatial queries
- **User Feed**: Personal check-in history
- **Following Feed**: Check-ins from people you follow on Bluesky
- **Stats**: System health and metrics

## Monitoring

- Check the Deno Deploy dashboard for runtime errors and logs
- Monitor `/api/stats` for system health
- Sentry captures errors automatically when configured

## Local Development

AT Protocol OAuth requires a public URL (no localhost). Use ngrok:

```bash
pkill -f ngrok
ngrok http 8000 --log=stdout &
BASE_URL=https://your-tunnel.ngrok-free.app deno task dev
```
