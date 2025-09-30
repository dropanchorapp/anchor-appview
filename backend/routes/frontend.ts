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

  // Individual checkin pages - serve React app (PDS-only, no SSR)
  app.get("/checkin/:id", (c) => {
    // PDS-only mode - just serve the React app, it handles data fetching
    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Anchor Check-in</title>

        <!-- Basic meta tags -->
        <meta property="og:title" content="Anchor Check-in">
        <meta property="og:description" content="View this check-in on Anchor">
        <meta property="og:type" content="article">
        <meta property="og:url" content="${c.req.url}">
        <meta property="og:site_name" content="Anchor">

        <!-- React app styles -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Epilogue:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.twind.style" crossorigin></script>
        <script src="https://esm.town/v/std/catch"></script>
      </head>
      <body>
        <!-- React app root -->
        <div id="root" style="background: #ff006b; min-height: 100vh"></div>

        <!-- Fallback for users without JavaScript -->
        <noscript>
          <div style="font-family: sans-serif; text-align: center; padding: 2rem;">
            <h1>Anchor Check-in</h1>
            <p>This check-in requires JavaScript to view. Please enable JavaScript in your browser.</p>
            <a href="/">← View Feed</a>
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
  });

  // Catch-all route for SPA
  app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

  return app;
}
