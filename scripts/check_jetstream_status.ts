#!/usr/bin/env -S deno run --allow-env --allow-net

/**
 * Debug script to check Jetstream poller status and diagnose ingestion issues
 * 
 * This script connects to the Val Town database and shows:
 * 1. Recent Jetstream poller runs from processing_log_v1
 * 2. Total number of check-ins in the database
 * 3. Latest check-in details
 * 4. Recent errors or failed runs
 */

import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

const API_TOKEN = Deno.env.get('VAL_TOWN_API_TOKEN');

if (!API_TOKEN) {
  console.error('❌ VAL_TOWN_API_TOKEN environment variable is required');
  console.error('Set it with: export VAL_TOWN_API_TOKEN=your_token_here');
  Deno.exit(1);
}

// Set up headers for Val Town API
const _headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json'
};

// Helper function to format dates
function formatDate(timestamp: string | number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { 
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

// Helper function to get relative time
function getRelativeTime(timestamp: string | number): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  return 'just now';
}

async function checkJetstreamStatus() {
  console.log('🔍 Checking Jetstream Poller Status...\n');

  try {
    // 1. Check recent processing log entries
    console.log('📊 Recent Jetstream Poller Runs:');
    console.log('='.repeat(80));
    
    const recentLogs = await sqlite.execute({
      statement: `
        SELECT timestamp, event_type, status, details, error_message
        FROM processing_log_v1
        WHERE event_type IN ('jetstream_poll_start', 'jetstream_poll_end', 'jetstream_error')
        ORDER BY timestamp DESC
        LIMIT 20
      `
    });

    if (recentLogs.rows.length === 0) {
      console.log('⚠️  No processing log entries found');
    } else {
      for (const log of recentLogs.rows) {
        const timestamp = formatDate(log[0] as string);
        const relativeTime = getRelativeTime(log[0] as string);
        const eventType = log[1] as string;
        const status = log[2] as string;
        const details = log[3] as string;
        const error = log[4] as string;

        let emoji = '📝';
        if (eventType === 'jetstream_poll_start') emoji = '▶️';
        else if (eventType === 'jetstream_poll_end') emoji = '✅';
        else if (eventType === 'jetstream_error' || status === 'error') emoji = '❌';

        console.log(`${emoji} ${timestamp} (${relativeTime})`);
        console.log(`   Type: ${eventType} | Status: ${status || 'N/A'}`);
        if (details) {
          try {
            const parsedDetails = JSON.parse(details);
            console.log(`   Details: ${JSON.stringify(parsedDetails, null, 2).split('\n').join('\n   ')}`);
          } catch {
            console.log(`   Details: ${details}`);
          }
        }
        if (error) console.log(`   Error: ${error}`);
        console.log();
      }
    }

    // 2. Check total number of check-ins
    console.log('\n📍 Check-in Statistics:');
    console.log('='.repeat(80));
    
    const totalCheckins = await sqlite.execute({
      statement: 'SELECT COUNT(*) as total FROM checkins_v1'
    });
    
    const total = totalCheckins.rows[0][0] as number;
    console.log(`Total check-ins in database: ${total}`);

    // 3. Get latest check-in details
    console.log('\n🆕 Latest Check-in:');
    console.log('='.repeat(80));
    
    const latestCheckin = await sqlite.execute({
      statement: `
        SELECT 
          uri,
          did,
          rkey,
          indexed_at,
          created_at,
          name,
          address,
          latitude,
          longitude,
          country,
          foursquare_venue_id,
          google_place_id,
          cache_status,
          cache_updated_at
        FROM checkins_v1
        ORDER BY indexed_at DESC
        LIMIT 1
      `
    });

    if (latestCheckin.rows.length === 0) {
      console.log('⚠️  No check-ins found in database');
    } else {
      const checkin = latestCheckin.rows[0];
      console.log(`URI: ${checkin[0]}`);
      console.log(`DID: ${checkin[1]}`);
      console.log(`RKey: ${checkin[2]}`);
      console.log(`Indexed: ${formatDate(checkin[3] as string)} (${getRelativeTime(checkin[3] as string)})`);
      console.log(`Created: ${formatDate(checkin[4] as string)}`);
      console.log(`Name: ${checkin[5] || 'N/A'}`);
      console.log(`Address: ${checkin[6] || 'N/A'}`);
      console.log(`Coordinates: ${checkin[7]}, ${checkin[8]}`);
      console.log(`Country: ${checkin[9] || 'N/A'}`);
      console.log(`Foursquare ID: ${checkin[10] || 'N/A'}`);
      console.log(`Google Place ID: ${checkin[11] || 'N/A'}`);
      console.log(`Cache Status: ${checkin[12] || 'N/A'}`);
      if (checkin[13]) {
        console.log(`Cache Updated: ${formatDate(checkin[13] as string)}`);
      }
    }

    // 4. Check for recent errors
    console.log('\n❌ Recent Errors:');
    console.log('='.repeat(80));
    
    const recentErrors = await sqlite.execute({
      statement: `
        SELECT timestamp, event_type, status, details, error_message
        FROM processing_log_v1
        WHERE status = 'error' OR error_message IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT 10
      `
    });

    if (recentErrors.rows.length === 0) {
      console.log('✅ No recent errors found');
    } else {
      console.log(`Found ${recentErrors.rows.length} recent errors:\n`);
      for (const error of recentErrors.rows) {
        const timestamp = formatDate(error[0] as string);
        const relativeTime = getRelativeTime(error[0] as string);
        const eventType = error[1] as string;
        const details = error[3] as string;
        const errorMsg = error[4] as string;

        console.log(`❌ ${timestamp} (${relativeTime})`);
        console.log(`   Event: ${eventType}`);
        if (details) {
          try {
            const parsedDetails = JSON.parse(details);
            console.log(`   Details: ${JSON.stringify(parsedDetails, null, 2).split('\n').join('\n   ')}`);
          } catch {
            console.log(`   Details: ${details}`);
          }
        }
        if (errorMsg) console.log(`   Error: ${errorMsg}`);
        console.log();
      }
    }

    // 5. Check polling frequency
    console.log('\n⏰ Polling Frequency Analysis:');
    console.log('='.repeat(80));
    
    const pollStarts = await sqlite.execute({
      statement: `
        SELECT timestamp
        FROM processing_log_v1
        WHERE event_type = 'jetstream_poll_start'
        ORDER BY timestamp DESC
        LIMIT 10
      `
    });

    if (pollStarts.rows.length >= 2) {
      const intervals: number[] = [];
      for (let i = 0; i < pollStarts.rows.length - 1; i++) {
        const current = new Date(pollStarts.rows[i][0] as string).getTime();
        const next = new Date(pollStarts.rows[i + 1][0] as string).getTime();
        intervals.push((current - next) / 60000); // Convert to minutes
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const minInterval = Math.min(...intervals);
      const maxInterval = Math.max(...intervals);

      console.log(`Average polling interval: ${avgInterval.toFixed(1)} minutes`);
      console.log(`Min interval: ${minInterval.toFixed(1)} minutes`);
      console.log(`Max interval: ${maxInterval.toFixed(1)} minutes`);
      console.log(`Expected interval: 5 minutes`);

      if (avgInterval > 6) {
        console.log('\n⚠️  WARNING: Polling interval is higher than expected (5 minutes)');
      }
    } else {
      console.log('⚠️  Not enough polling data to analyze frequency');
    }

    // 6. Check for duplicate prevention
    console.log('\n🔄 Duplicate Check-ins Analysis:');
    console.log('='.repeat(80));
    
    const duplicates = await sqlite.execute({
      statement: `
        SELECT uri, COUNT(*) as count
        FROM checkins_v1
        GROUP BY uri
        HAVING COUNT(*) > 1
      `
    });

    if (duplicates.rows.length === 0) {
      console.log('✅ No duplicate check-ins found');
    } else {
      console.log(`⚠️  Found ${duplicates.rows.length} duplicate URIs:`);
      for (const dup of duplicates.rows) {
        console.log(`   ${dup[0]} - ${dup[1]} occurrences`);
      }
    }

    // 7. Recent check-in ingestion timeline
    console.log('\n📅 Recent Check-in Ingestion Timeline:');
    console.log('='.repeat(80));
    
    const recentCheckins = await sqlite.execute({
      statement: `
        SELECT 
          indexed_at,
          uri,
          did,
          name
        FROM checkins_v1
        ORDER BY indexed_at DESC
        LIMIT 10
      `
    });

    if (recentCheckins.rows.length === 0) {
      console.log('⚠️  No check-ins to show');
    } else {
      for (const checkin of recentCheckins.rows) {
        const timestamp = formatDate(checkin[0] as string);
        const relativeTime = getRelativeTime(checkin[0] as string);
        const uri = checkin[1] as string;
        const did = checkin[2] as string;
        const name = checkin[3] as string || 'Unknown location';

        console.log(`📍 ${timestamp} (${relativeTime})`);
        console.log(`   ${name}`);
        console.log(`   URI: ${uri}`);
        console.log(`   DID: ${did}`);
        console.log();
      }
    }

  } catch (error) {
    console.error('❌ Error checking Jetstream status:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the status check
await checkJetstreamStatus();