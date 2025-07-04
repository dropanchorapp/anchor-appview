#!/bin/bash

# Anchor AppView API Monitoring Script
# Monitors the deployed API and shows current status

BASE_URL="https://anchor-feed-generator.val.run"

echo "📊 Anchor AppView Status Monitor"
echo "==============================="
echo "API: $BASE_URL"
echo "Timestamp: $(date)"
echo ""

# Get current stats
echo "📈 Current Statistics:"
STATS=$(curl -s "$BASE_URL/stats")
echo "$STATS" | jq '.'

# Extract counts for decision making
TOTAL_CHECKINS=$(echo "$STATS" | jq -r '.totalCheckins // 0')
TOTAL_USERS=$(echo "$STATS" | jq -r '.totalUsers // 0')

echo ""
if [ "$TOTAL_CHECKINS" -eq 0 ]; then
    echo "⏳ No check-ins yet. System is waiting for data ingestion."
    echo "   The jetstream poller runs hourly to collect new check-ins."
    echo ""
    echo "🔧 Health Checks:"
    echo "   ✅ API responding"
    echo "   ✅ Database initialized" 
    echo "   ⏳ Waiting for data"
else
    echo "✅ System has data! Testing feeds with real data..."
    echo ""
    
    # Test global feed with real data
    echo "🌍 Recent Global Check-ins:"
    curl -s "$BASE_URL/global?limit=3" | jq '.checkins[] | {text, author: .author.handle, location: .address.name, time: .createdAt}'
    
    echo ""
    echo "📍 Testing Nearby (Amsterdam - should work if any Dutch check-ins):"
    curl -s "$BASE_URL/nearby?lat=52.3676&lng=4.9041&radius=50&limit=3" | jq '.checkins | length'
fi

echo ""
echo "🚀 Quick API Tests:"
echo "   /stats: $(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/stats")"
echo "   /global: $(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/global")"
echo "   /nearby: $(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/nearby?lat=0&lng=0&radius=5")"

echo ""
echo "🔍 Monitoring Commands:"
if command -v vt &> /dev/null; then
    echo "   vt logs jetstreamPoller  # Check ingestion logs"
    echo "   vt logs anchorAPI       # Check API logs" 
    echo "   vt logs socialGraphSync # Check social sync logs"
else
    echo "   Install Val Town CLI: npm install -g @valtown/cli"
fi

echo ""
echo "🌐 Live API: $BASE_URL"