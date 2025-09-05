// Frontend and static content routes
import { Hono } from "jsr:@hono/hono@4.9.6";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";

export function createFrontendRoutes() {
  const app = new Hono();

  // Static file serving
  app.get("/frontend/*", (c) => serveFile(c.req.path, import.meta.url));
  app.get("/shared/*", (c) => serveFile(c.req.path, import.meta.url));

  // Terms of Service
  app.get("/terms", (_c) => {
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Terms of Service - Anchor</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; 
          }
          h1 { color: #1a365d; }
          .last-updated { color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p class="last-updated">Last updated: ${
        new Date().toLocaleDateString()
      }</p>
        
        <h2>1. Acceptance of Terms</h2>
        <p>By using the Anchor location feed service, you agree to these terms.</p>
        
        <h2>2. Service Description</h2>
        <p>Anchor provides location-based social feeds for the AT Protocol network.</p>
        
        <h2>3. Data Usage</h2>
        <p>We process publicly available check-in data from the AT Protocol network to provide location-based feeds.</p>
        
        <h2>4. Privacy</h2>
        <p>See our <a href="/privacy">Privacy Policy</a> for information about data handling.</p>
        
        <h2>5. Acceptable Use</h2>
        <p>You agree to use our service responsibly and in compliance with applicable laws.</p>
        
        <h2>6. Limitation of Liability</h2>
        <p>Our service is provided "as is" without warranties. We limit our liability to the extent permitted by law.</p>
        
        <h2>7. Changes to Terms</h2>
        <p>We may update these terms. Continued use constitutes acceptance of updated terms.</p>
        
        <h2>8. Contact</h2>
        <p>Questions about these terms can be directed to our support channels.</p>
      </body>
      </html>
      `,
      { headers: { "Content-Type": "text/html" } },
    );
  });

  // Privacy Policy
  app.get("/privacy", (_c) => {
    return new Response(
      `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - Anchor</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; 
          }
          h1 { color: #1a365d; }
          .last-updated { color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p class="last-updated">Last updated: ${
        new Date().toLocaleDateString()
      }</p>
        
        <h2>1. Information We Collect</h2>
        <p>We collect publicly available check-in data from the AT Protocol network and session information for authenticated users.</p>
        
        <h2>2. How We Use Information</h2>
        <p>We use collected data to provide location-based social feeds and improve our service.</p>
        
        <h2>3. Data Sharing</h2>
        <p>We do not sell or share personal data with third parties except as necessary to operate our service.</p>
        
        <h2>4. Data Security</h2>
        <p>We implement appropriate security measures to protect user data.</p>
        
        <h2>5. Data Retention</h2>
        <p>We retain data as necessary to provide our service and comply with legal obligations.</p>
        
        <h2>6. Your Rights</h2>
        <p>You have rights regarding your personal data as provided by applicable privacy laws.</p>
        
        <h2>7. Cookies and Sessions</h2>
        <p>We use encrypted session cookies to maintain user authentication.</p>
        
        <h2>8. Contact Information</h2>
        <p>Questions about this privacy policy can be directed to our support channels.</p>
      </body>
      </html>
      `,
      { headers: { "Content-Type": "text/html" } },
    );
  });

  // Individual checkin pages - serve React app with noscript fallback
  app.get("/checkin/:id", async (c) => {
    try {
      const checkinId = c.req.param("id");
      if (!checkinId) {
        return new Response("Checkin ID required", { status: 400 });
      }

      // Fetch checkin data for meta tags and noscript fallback
      const { getCheckinById } = await import("../api/checkins.ts");
      const checkin = await getCheckinById(checkinId);

      if (!checkin) {
        return new Response("Checkin not found", { status: 404 });
      }

      // Format location for display
      const locationParts = [
        checkin.venueName,
        checkin.addressLocality,
        checkin.addressRegion,
      ].filter(Boolean);
      const location = locationParts.join(", ") ||
        `${checkin.latitude}, ${checkin.longitude}`;

      return new Response(
        `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Check-in by ${
          checkin.displayName || checkin.handle
        } - Anchor</title>
          
          <!-- Open Graph meta tags for social sharing -->
          <meta property="og:title" content="Check-in by ${
          checkin.displayName || checkin.handle
        }">
          <meta property="og:description" content="${
          checkin.text || `Checked in at ${location}`
        }">
          <meta property="og:type" content="article">
          <meta property="og:url" content="${c.req.url}">
          <meta property="og:site_name" content="Anchor">
          ${
          checkin.avatar
            ? `<meta property="og:image" content="${checkin.avatar}">`
            : ""
        }
          ${
          checkin.avatar
            ? `<meta property="og:image:alt" content="Profile picture of ${
              checkin.displayName || checkin.handle
            }">`
            : ""
        }
          <meta property="og:locale" content="en_US">
          
          <!-- Twitter Card meta tags -->
          <meta name="twitter:card" content="summary">
          <meta name="twitter:title" content="Check-in by ${
          checkin.displayName || checkin.handle
        }">
          <meta name="twitter:description" content="${
          checkin.text || `Checked in at ${location}`
        }">
          ${
          checkin.avatar
            ? `<meta name="twitter:image" content="${checkin.avatar}">`
            : ""
        }
          ${
          checkin.avatar
            ? `<meta name="twitter:image:alt" content="Profile picture of ${
              checkin.displayName || checkin.handle
            }">`
            : ""
        }
          <meta name="twitter:site" content="@anchor_app">
          <meta name="twitter:creator" content="@${checkin.handle}">
          
          <!-- Additional meta tags for better SEO -->
          <meta name="description" content="${
          checkin.text ||
          `Check-in by ${checkin.displayName || checkin.handle} at ${location}`
        }">
          <meta name="author" content="${
          checkin.displayName || checkin.handle
        }">
          <meta name="robots" content="index, follow">
          <link rel="canonical" href="${c.req.url}">
          
          <!-- React app styles and scripts -->
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Epilogue:wght@400;600;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.twind.style" crossorigin></script>
          <script src="https://esm.town/v/std/catch"></script>
        </head>
        <body>
          <!-- React app root -->
          <div id="root" style="background: #ff006b; min-height: 100vh"></div>
          
          <!-- Fallback content for users without JavaScript -->
          <noscript>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 600px; margin: 0 auto; padding: 2rem; line-height: 1.6; 
                background: white;
              }
              .checkin-card { 
                border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;
                background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              .user-info { display: flex; align-items: center; margin-bottom: 1rem; }
              .avatar { width: 40px; height: 40px; border-radius: 20px; margin-right: 0.75rem; }
              .user-details h3 { margin: 0; color: #1a365d; }
              .user-details p { margin: 0; color: #666; font-size: 0.9rem; }
              .checkin-text { margin: 1rem 0; font-size: 1.1rem; }
              .location { color: #666; margin-top: 0.5rem; }
              .timestamp { color: #999; font-size: 0.85rem; margin-top: 1rem; }
              .view-feed { margin-top: 2rem; text-align: center; }
              .view-feed a { 
                color: #3182ce; text-decoration: none; font-weight: 500;
                border: 1px solid #3182ce; padding: 0.5rem 1rem; border-radius: 4px;
                display: inline-block;
              }
              .view-feed a:hover { background: #3182ce; color: white; }
            </style>
            <div class="checkin-card">
              <div class="user-info">
                ${
          checkin.avatar
            ? `<img src="${checkin.avatar}" alt="${
              checkin.displayName || checkin.handle
            }" class="avatar">`
            : ""
        }
                <div class="user-details">
                  <h3>${checkin.displayName || checkin.handle}</h3>
                  <p>@${checkin.handle}</p>
                </div>
              </div>
              
              ${
          checkin.text ? `<div class="checkin-text">${checkin.text}</div>` : ""
        }
              
              <div class="location">📍 ${location}</div>
              
              <div class="timestamp">
                ${new Date(checkin.createdAt).toLocaleString()}
              </div>
            </div>
            
            <div class="view-feed">
              <a href="/">← View Full Feed</a>
            </div>
          </noscript>
          
          <!-- Load React app -->
          <script type="module" src="/frontend/index.tsx"></script>
        </body>
        </html>`,
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    } catch (err) {
      console.error("Error serving checkin page:", err);
      return new Response("Error loading checkin", { status: 500 });
    }
  });

  // Catch-all route for SPA
  app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

  return app;
}
