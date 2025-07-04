# Anchor AppView Deployment Guide

## Prerequisites

Ensure you have the Val Town CLI installed:

```bash
npm install -g @valtown/cli
# or
npx @valtown/cli --help
```

## Functions Overview

This AppView consists of 3 main Val Town functions:

1. **jetstreamPoller** - Cron job (5 minutes)
2. **anchorAPI** - HTTP function  
3. **socialGraphSync** - Cron job (daily)

## Quick Deployment with Val Town CLI

### 1. Deploy All Functions

```bash
# Deploy the ingestion cron job
vt create cron jetstreamPoller --file src/ingestion/jetstream-poller.ts --schedule "*/5 * * * *"

# Deploy the HTTP API
vt create http anchorAPI --file src/api/anchor-api.ts

# Deploy the social sync cron job
vt create cron socialGraphSync --file src/social/social-graph-sync.ts --schedule "0 2 * * *"
```

### 2. Verify Deployments

```bash
# List your functions
vt list

# Check function status
vt status jetstreamPoller
vt status anchorAPI
vt status socialGraphSync
```

### 3. Test the API

```bash
# Get your API URL
API_URL=$(vt url anchorAPI)

# Test endpoints
curl "$API_URL/stats"
curl "$API_URL/global?limit=5"
```

## Alternative: Manual Deployment

If you prefer the web interface:

### 1. No Database Setup Required
Tables are automatically created when functions first run.

### 2. Create Functions via Web Interface
- Go to [val.town](https://val.town)
- Create new cron function: `jetstreamPoller`
- Copy code from `src/ingestion/jetstream-poller.ts`
- Set schedule: `*/5 * * * *`

### 3. Repeat for Other Functions
- HTTP function: `anchorAPI` from `src/api/anchor-api.ts`
- Cron function: `socialGraphSync` from `src/social/social-graph-sync.ts` (schedule: `0 2 * * *`)

## Environment Variables

No environment variables are required for the basic deployment. All authentication uses public APIs.

## Testing the Deployment

### 1. Test Data Ingestion
Monitor the `jetstreamPoller` logs to ensure it's receiving and processing check-in events.

### 2. Test API Endpoints
Use the provided test script or Val Town CLI:

```bash
# Using the test script (update BASE_URL first)
./scripts/test-api.sh

# Or using Val Town CLI
API_URL=$(vt url anchorAPI)
curl "$API_URL/global?limit=5"
curl "$API_URL/stats"
curl "$API_URL/nearby?lat=52.0705&lng=4.3007&radius=5"
```

### 3. Monitor Processing Logs
Check the `processing_log_v1` table to monitor ingestion health and performance.

## Scaling Considerations

### Performance Optimization
- Monitor SQLite performance as data grows
- Consider implementing pagination for large result sets
- Add query timeout handling for long-running spatial queries

### Rate Limiting
- The social graph sync includes built-in rate limiting
- Jetstream poller has a 45-second collection window
- API endpoints have built-in limits (max 100 results per query)

### Error Handling
- All functions include comprehensive error handling
- Failed address resolutions are cached to avoid retry storms
- Processing logs track errors for monitoring

## Monitoring and Maintenance

### Health Checks
- Monitor the `/stats` endpoint for system health
- Check processing logs for ingestion errors
- Monitor SQLite database size and performance

### Database Maintenance
- Periodically clean up old processing logs
- Monitor address cache hit rates
- Consider archiving old check-ins if storage becomes an issue

### Updates and Schema Changes
- When changing database schema, increment table versions (e.g., `checkins_v1` → `checkins_v2`)
- Test schema migrations carefully in development
- Consider data migration scripts for breaking changes

## Troubleshooting

### Common Issues
1. **Jetstream connection failures**: Check network connectivity and Jetstream service status
2. **Address resolution errors**: Verify AT Protocol network accessibility
3. **Social graph sync failures**: Check Bluesky API rate limits and status
4. **SQLite performance**: Monitor query execution times and optimize indexes

### Debugging
- All functions include detailed logging
- Use Val Town's built-in debugging tools
- Monitor function execution times and memory usage

## Security Considerations

- All API endpoints include proper CORS headers
- No sensitive data is logged or stored
- Public APIs are used for all external integrations
- Rate limiting prevents abuse of external services

## Integration with Anchor Client

The deployed AppView provides these endpoints for the Anchor client:

- **Global Feed**: Recent check-ins from all users
- **Nearby Feed**: Location-based spatial queries
- **User Feed**: Personal check-in history
- **Following Feed**: Social feed based on Bluesky follows
- **Stats**: System health and metrics

Each endpoint returns properly formatted JSON with consistent response structures for easy client integration.