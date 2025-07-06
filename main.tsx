// @val-town anchordashboard
// Main frontend dashboard for Anchor AppView feed generator
import { sqlite } from "https://esm.town/v/stevekrouse/sqlite";

export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle different dashboard pages
  if (url.pathname === "/api") {
    // Redirect to API documentation (Val Town compatible redirect)
    return new Response(null, { 
      status: 302, 
      headers: { Location: "https://anchor-feed-generator.val.run" }
    });
  }
  
  // Main dashboard
  await initializeTables();
  const stats = await getDashboardStats();
  const html = generateDashboardHTML(stats);
  
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache, max-age=0"
    }
  });
}

async function initializeTables() {
  // Ensure all tables exist (same as in other files)
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS checkins_v1 (
      id TEXT PRIMARY KEY,
      uri TEXT UNIQUE NOT NULL,
      author_did TEXT NOT NULL,
      author_handle TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      address_ref_uri TEXT,
      address_ref_cid TEXT,
      cached_address_name TEXT,
      cached_address_street TEXT,
      cached_address_locality TEXT,
      cached_address_region TEXT,
      cached_address_country TEXT,
      cached_address_postal_code TEXT,
      cached_address_full JSON,
      address_resolved_at TEXT,
      indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS address_cache_v1 (
      uri TEXT PRIMARY KEY,
      cid TEXT,
      name TEXT,
      street TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      postal_code TEXT,
      latitude REAL,
      longitude REAL,
      full_data JSON,
      resolved_at TEXT,
      failed_at TEXT
    )
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS processing_log_v1 (
      id INTEGER PRIMARY KEY,
      run_at TEXT NOT NULL,
      events_processed INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      duration_ms INTEGER
    )
  `);
}

async function getDashboardStats() {
  const [
    checkinsCount,
    usersCount,
    addressesResolved,
    addressesFailed,
    addressesTotal,
    recentCheckins,
    recentActivity,
    lastProcessingRun,
    checkinsWithAddresses
  ] = await Promise.all([
    // Total check-ins
    sqlite.execute(`SELECT COUNT(*) as count FROM checkins_v1`),
    
    // Unique users
    sqlite.execute(`SELECT COUNT(DISTINCT author_did) as count FROM checkins_v1`),
    
    // Successfully resolved addresses
    sqlite.execute(`SELECT COUNT(*) as count FROM address_cache_v1 WHERE resolved_at IS NOT NULL`),
    
    // Failed address resolutions
    sqlite.execute(`SELECT COUNT(*) as count FROM address_cache_v1 WHERE failed_at IS NOT NULL`),
    
    // Total addresses in cache
    sqlite.execute(`SELECT COUNT(*) as count FROM address_cache_v1`),
    
    // Recent check-ins (last 5)
    sqlite.execute(`
      SELECT text, author_handle, created_at, cached_address_name 
      FROM checkins_v1 
      ORDER BY created_at DESC 
      LIMIT 5
    `),
    
    // Recent activity (24 hours)
    sqlite.execute(`
      SELECT COUNT(*) as count 
      FROM checkins_v1 
      WHERE created_at > datetime('now', '-24 hours')
    `),
    
    // Last processing run
    sqlite.execute(`
      SELECT * FROM processing_log_v1 
      ORDER BY run_at DESC 
      LIMIT 1
    `),
    
    // Check-ins with resolved addresses
    sqlite.execute(`
      SELECT COUNT(*) as count 
      FROM checkins_v1 
      WHERE address_resolved_at IS NOT NULL
    `)
  ]);

  return {
    totalCheckins: checkinsCount.rows?.[0]?.count || 0,
    totalUsers: usersCount.rows?.[0]?.count || 0,
    addressesResolved: addressesResolved.rows?.[0]?.count || 0,
    addressesFailed: addressesFailed.rows?.[0]?.count || 0,
    addressesTotal: addressesTotal.rows?.[0]?.count || 0,
    recentCheckins: recentCheckins.rows ? recentCheckins.rows : [],
    recentActivity: recentActivity.rows?.[0]?.count || 0,
    lastProcessingRun: lastProcessingRun.rows && lastProcessingRun.rows.length > 0 ? lastProcessingRun.rows[0] : null,
    checkinsWithAddresses: checkinsWithAddresses.rows?.[0]?.count || 0,
    timestamp: new Date().toISOString()
  };
}

function generateDashboardHTML(stats: any): string {
  const addressResolutionRate = stats.totalCheckins > 0 
    ? ((stats.checkinsWithAddresses / stats.totalCheckins) * 100).toFixed(1)
    : 0;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anchor AppView Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f8fafc;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header h1 {
            color: #1e293b;
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #3b82f6;
            margin: 10px 0;
        }
        .stat-label {
            color: #64748b;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-detail {
            color: #64748b;
            font-size: 0.8em;
            margin-top: 5px;
        }
        .recent-section {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .recent-section h3 {
            margin-top: 0;
            color: #1e293b;
        }
        .checkin-item {
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        .checkin-item:last-child {
            border-bottom: none;
        }
        .checkin-text {
            font-weight: 500;
            margin-bottom: 5px;
        }
        .checkin-meta {
            font-size: 0.8em;
            color: #64748b;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .footer a {
            color: #3b82f6;
            text-decoration: none;
            margin: 0 10px;
        }
        .footer a:hover {
            text-decoration: underline;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-active { background: #10b981; }
        .status-idle { background: #f59e0b; }
        .status-error { background: #ef4444; }
        .refresh-button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-left: 10px;
        }
        .refresh-button:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚓ Anchor AppView Dashboard</h1>
        <p>Location-based check-ins feed generator for AT Protocol</p>
        <p style="color: #64748b; font-size: 0.9em;">
            Last updated: ${new Date(stats.timestamp).toLocaleString()}
            <a href="/" class="refresh-button">Refresh</a>
        </p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Check-ins</div>
            <div class="stat-value">${stats.totalCheckins}</div>
            <div class="stat-detail">From ${stats.totalUsers} unique users</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Addresses Resolved</div>
            <div class="stat-value">${stats.checkinsWithAddresses}</div>
            <div class="stat-detail">${addressResolutionRate}% resolution rate</div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Address Cache</div>
            <div class="stat-value">${stats.addressesResolved}</div>
            <div class="stat-detail">
                ${stats.addressesFailed} failed, ${stats.addressesTotal} total
            </div>
        </div>

        <div class="stat-card">
            <div class="stat-label">Recent Activity</div>
            <div class="stat-value">${stats.recentActivity}</div>
            <div class="stat-detail">Check-ins in last 24 hours</div>
        </div>
    </div>

    ${stats.lastProcessingRun ? `
    <div class="recent-section">
        <h3>
            <span class="status-indicator ${getProcessingStatus(stats.lastProcessingRun)}"></span>
            Last Processing Run
        </h3>
        <p><strong>Time:</strong> ${new Date(stats.lastProcessingRun.run_at).toLocaleString()}</p>
        <p><strong>Events Processed:</strong> ${stats.lastProcessingRun.events_processed}</p>
        <p><strong>Errors:</strong> ${stats.lastProcessingRun.errors}</p>
        <p><strong>Duration:</strong> ${stats.lastProcessingRun.duration_ms}ms</p>
    </div>
    ` : `
    <div class="recent-section">
        <h3>
            <span class="status-indicator status-idle"></span>
            Processing Status
        </h3>
        <p>No processing runs yet. Jetstream poller may not be active.</p>
    </div>
    `}

    ${stats.recentCheckins.length > 0 ? `
    <div class="recent-section">
        <h3>Recent Check-ins</h3>
        ${stats.recentCheckins.map((checkin: any) => `
            <div class="checkin-item">
                <div class="checkin-text">"${checkin.text || 'No message'}"</div>
                <div class="checkin-meta">
                    By ${checkin.author_handle || 'Unknown'} • 
                    ${new Date(checkin.created_at).toLocaleString()} • 
                    ${checkin.cached_address_name || 'Address not resolved'}
                </div>
            </div>
        `).join('')}
    </div>
    ` : `
    <div class="recent-section">
        <h3>Recent Check-ins</h3>
        <p>No check-ins found. System is waiting for data ingestion.</p>
    </div>
    `}

    <div class="footer">
        <h3>API Endpoints</h3>
        <a href="/global">Global Feed</a>
        <a href="/nearby?lat=52.3676&lng=4.9041&radius=5">Nearby (Amsterdam)</a>
        <a href="/stats">Stats JSON</a>
        <br><br>
        <p style="color: #64748b; font-size: 0.9em;">
            Anchor AppView • Powered by <a href="https://val.town">Val Town</a>
        </p>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setTimeout(() => {
            window.location.reload();
        }, 30000);
    </script>
</body>
</html>
  `;
}

function getProcessingStatus(run: any): string {
  if (!run) return 'status-idle';
  
  const lastRun = new Date(run.run_at);
  const now = new Date();
  const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
  
  // If last run was within 10 minutes and had no errors, status is active
  if (minutesSinceLastRun < 10 && run.errors === 0) {
    return 'status-active';
  }
  
  // If errors occurred, status is error
  if (run.errors > 0) {
    return 'status-error';
  }
  
  // Otherwise, idle
  return 'status-idle';
}