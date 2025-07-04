#!/bin/bash

# Anchor AppView Deployment Script for Val Town
# Deploys all three functions using the Val Town CLI

echo "🚀 Deploying Anchor AppView to Val Town"
echo "========================================"

# Check if Val Town CLI is installed
if ! command -v vt &> /dev/null; then
    echo "❌ Val Town CLI not found!"
    echo "Please install it first:"
    echo "npm install -g @valtown/cli"
    exit 1
fi

# Check if user is logged in
if ! vt whoami &> /dev/null; then
    echo "❌ Not logged in to Val Town"
    echo "Please login first:"
    echo "vt login"
    exit 1
fi

echo "✅ Val Town CLI found and authenticated"
echo ""

# Deploy functions
echo "📡 Deploying functions..."

# Deploy ingestion cron job
echo "1/3 Deploying jetstreamPoller (cron job)..."
if vt create cron jetstreamPoller --file src/ingestion/jetstream-poller.ts --schedule "*/5 * * * *"; then
    echo "✅ jetstreamPoller deployed successfully"
else
    echo "❌ Failed to deploy jetstreamPoller"
    exit 1
fi

# Deploy HTTP API
echo "2/3 Deploying anchorAPI (HTTP function)..."
if vt create http anchorAPI --file src/api/anchor-api.ts; then
    echo "✅ anchorAPI deployed successfully"
    API_URL=$(vt url anchorAPI)
    echo "📍 API available at: $API_URL"
else
    echo "❌ Failed to deploy anchorAPI"
    exit 1
fi

# Deploy social sync cron job
echo "3/3 Deploying socialGraphSync (daily cron job)..."
if vt create cron socialGraphSync --file src/social/social-graph-sync.ts --schedule "0 2 * * *"; then
    echo "✅ socialGraphSync deployed successfully"
else
    echo "❌ Failed to deploy socialGraphSync"
    exit 1
fi

echo ""
echo "🎉 All functions deployed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "├── jetstreamPoller: Runs every 5 minutes to ingest check-ins"
echo "├── anchorAPI: HTTP API for feeds and queries"
echo "└── socialGraphSync: Runs daily at 2 AM UTC to sync social graph"
echo ""
echo "🔍 Next steps:"
echo "1. Test the API: ./scripts/test-api.sh"
echo "2. Monitor logs: vt logs <function-name>"
echo "3. Check function status: vt list"
echo ""
echo "📍 API URL: $API_URL"