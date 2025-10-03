// Frontend and static content routes
import { Hono } from "jsr:@hono/hono@4.9.6";
import { serveFile } from "https://esm.town/v/std/utils@85-main/index.ts";
import {
  resolveHandleToDid,
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../api/anchor-api.ts";

// Helper function to escape HTML entities for safe meta tag content
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper function to fetch checkin data directly (for SSR)
async function fetchCheckinData(identifier: string, rkey: string) {
  try {
    // Resolve identifier to DID
    let did: string;
    if (identifier.startsWith("did:")) {
      did = identifier;
    } else {
      const resolvedDid = await resolveHandleToDid(identifier);
      if (!resolvedDid) {
        return null;
      }
      did = resolvedDid;
    }

    const pdsUrl = await resolvePdsUrl(did);
    if (!pdsUrl) {
      return null;
    }

    // Fetch the check-in record from PDS
    const checkinResponse = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=app.dropanchor.checkin&rkey=${rkey}`,
    );

    if (!checkinResponse.ok) {
      return null;
    }

    const checkinData = await checkinResponse.json();

    // Resolve profile data for the checkin author
    const profileData = await resolveProfileFromPds(did);

    // Build the response object
    const checkin: any = {
      id: rkey,
      uri: `at://${did}/app.dropanchor.checkin/${rkey}`,
      author: {
        did: did,
        handle: profileData?.handle || did,
        displayName: profileData?.displayName,
        avatar: profileData?.avatar,
      },
      text: checkinData.value.text,
      createdAt: checkinData.value.createdAt,
      coordinates: checkinData.value.coordinates,
    };

    // Resolve address if addressRef exists
    if (checkinData.value.addressRef) {
      try {
        const addressRkey = checkinData.value.addressRef.uri.split("/").pop();
        const addressResponse = await fetch(
          `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=community.lexicon.location.address&rkey=${addressRkey}`,
        );

        if (addressResponse.ok) {
          const addressData = await addressResponse.json();
          checkin.address = addressData.value;
        }
      } catch (err) {
        console.warn("Failed to resolve address for checkin:", err);
      }
    }

    // Add image URLs if image exists
    if (checkinData.value.image) {
      const thumbCid = checkinData.value.image.thumb.ref.$link;
      const fullsizeCid = checkinData.value.image.fullsize.ref.$link;

      checkin.image = {
        thumbUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${thumbCid}`,
        fullsizeUrl:
          `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${fullsizeCid}`,
        alt: checkinData.value.image.alt,
      };
    }

    return checkin;
  } catch (error) {
    console.error("Failed to fetch checkin data:", error);
    return null;
  }
}

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

  // Helper function to render checkin page with meta tags
  async function renderCheckinPage(c: any, checkinId: string) {
    // Fetch checkin data to populate meta tags
    let metaTitle = "Anchor Check-in";
    let metaDescription = "View this check-in on Anchor";
    let metaImage =
      "https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png";
    let metaImageType = "image/png";
    let checkinData = null; // Store for reuse in noscript

    // Parse checkinId into identifier and rkey
    const parts = checkinId.split("/");
    if (parts.length === 2) {
      const [identifier, rkey] = parts;
      checkinData = await fetchCheckinData(identifier, rkey);
    }

    if (checkinData) {
      const checkin = checkinData;

      const authorName = checkin.author?.displayName ||
        checkin.author?.handle || "Someone";
      const locationName = checkin.address?.name ||
        checkin.address?.locality || "a location";

      // Build title from checkin text if available, otherwise use "dropped anchor" format
      if (checkin.text) {
        metaTitle = checkin.text;
      } else {
        metaTitle = `${authorName} dropped anchor at ${locationName}`;
      }

      // Build description from location info
      const locationParts = [
        checkin.address?.name,
        checkin.address?.locality,
        checkin.address?.region,
        checkin.address?.country,
      ].filter(Boolean);
      metaDescription = locationParts.length > 0
        ? `${authorName} at ${locationParts.join(", ")}`
        : `Check-in by ${authorName}`;

      // Use checkin image if available
      if (checkin.image?.fullsizeUrl) {
        metaImage = checkin.image.fullsizeUrl;
        // Infer mime type from URL or use generic image type
        // AT Protocol blobs can be jpeg, png, or webp
        if (checkin.image.fullsizeUrl.includes("image/jpeg")) {
          metaImageType = "image/jpeg";
        } else if (checkin.image.fullsizeUrl.includes("image/png")) {
          metaImageType = "image/png";
        } else if (checkin.image.fullsizeUrl.includes("image/webp")) {
          metaImageType = "image/webp";
        } else {
          metaImageType = "image/jpeg"; // Most common for photos
        }
      }
    }

    // Escape all meta tag content for safety
    const safeTitle = escapeHtml(metaTitle);
    const safeDescription = escapeHtml(metaDescription);

    // Build noscript content with checkin details
    let noscriptContent = `
      <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="font-size: 1.5rem; margin: 0 0 1rem 0; color: #1a1a1a;">${safeTitle}</h1>`;

    // Add checkin details if available
    if (checkinData) {
      const checkin = checkinData;

      if (checkin.text) {
        noscriptContent += `
        <p style="margin: 0 0 1.5rem 0; color: #333; line-height: 1.6;">${
          escapeHtml(checkin.text)
        }</p>`;
      }

      if (checkin.image?.fullsizeUrl) {
        noscriptContent += `
        <img src="${checkin.image.fullsizeUrl}" alt="${safeDescription}" style="width: 100%; height: auto; border-radius: 4px; margin-bottom: 1.5rem;">`;
      }

      noscriptContent += `
        <div style="padding: 1rem; background: #f5f5f5; border-radius: 4px; margin-bottom: 1rem;">
          <h2 style="font-size: 0.875rem; font-weight: 600; margin: 0 0 0.5rem 0; color: #666; text-transform: uppercase;">Location</h2>`;

      if (checkin.address?.name) {
        noscriptContent += `
          <p style="margin: 0 0 0.25rem 0; font-weight: 600; color: #1a1a1a;">${
          escapeHtml(checkin.address.name)
        }</p>`;
      }

      const addressParts = [
        checkin.address?.street,
        checkin.address?.locality,
        checkin.address?.region,
        checkin.address?.country,
      ].filter(Boolean);

      if (addressParts.length > 0) {
        noscriptContent += `
          <p style="margin: 0; color: #666; font-size: 0.875rem;">${
          escapeHtml(addressParts.join(", "))
        }</p>`;
      }

      if (checkin.coordinates) {
        noscriptContent += `
          <p style="margin: 0.5rem 0 0 0; color: #999; font-size: 0.75rem;">📍 ${
          checkin.coordinates.latitude.toFixed(6)
        }, ${checkin.coordinates.longitude.toFixed(6)}</p>`;
      }

      noscriptContent += `
        </div>`;

      if (checkin.author) {
        noscriptContent += `
        <div style="display: flex; align-items: center; padding-top: 1rem; border-top: 1px solid #e5e5e5;">`;

        if (checkin.author.avatar) {
          noscriptContent += `
          <img src="${checkin.author.avatar}" alt="${
            escapeHtml(checkin.author.displayName || checkin.author.handle)
          }" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 0.75rem;">`;
        }

        noscriptContent += `
          <div>
            <p style="margin: 0; font-weight: 600; color: #1a1a1a;">${
          escapeHtml(
            checkin.author.displayName || checkin.author.handle,
          )
        }</p>
            <p style="margin: 0; color: #666; font-size: 0.875rem;">@${
          escapeHtml(checkin.author.handle)
        }</p>
          </div>
        </div>`;
      }

      if (checkin.createdAt) {
        const date = new Date(checkin.createdAt);
        noscriptContent += `
        <p style="margin: 1rem 0 0 0; color: #999; font-size: 0.875rem;">${date.toLocaleDateString()} at ${date.toLocaleTimeString()}</p>`;
      }
    }

    noscriptContent += `
        <p style="margin: 1.5rem 0 0 0; padding-top: 1rem; border-top: 1px solid #e5e5e5; color: #666; font-size: 0.875rem;">
          This page requires JavaScript for the full interactive experience. Please enable JavaScript in your browser.
        </p>
        <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #ff006b; color: white; text-decoration: none; border-radius: 4px; font-weight: 600;">← View All Check-ins</a>
      </div>`;

    return new Response(
      `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${safeTitle}</title>

        <!-- Open Graph meta tags for social sharing -->
        <meta property="og:title" content="${safeTitle}">
        <meta property="og:description" content="${safeDescription}">
        <meta property="og:type" content="article">
        <meta property="og:url" content="${c.req.url}">
        <meta property="og:site_name" content="Anchor">
        <meta property="og:image" content="${metaImage}">
        <meta property="og:image:type" content="${metaImageType}">
        <meta property="og:image:alt" content="${safeDescription}">

        <!-- Twitter Card meta tags -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${safeTitle}">
        <meta name="twitter:description" content="${safeDescription}">
        <meta name="twitter:image" content="${metaImage}">
        <meta name="twitter:image:alt" content="${safeDescription}">

        <!-- React app styles -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Epilogue:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.twind.style" crossorigin></script>
        <script src="https://esm.town/v/std/catch"></script>
      </head>
      <body style="margin: 0; background: #f5f5f5;">
        <!-- React app root -->
        <div id="root" style="background: #ff006b; min-height: 100vh"></div>

        <!-- Fallback for users without JavaScript and search engine crawlers -->
        <noscript>${noscriptContent}</noscript>

        <!-- Load React app -->
        <script type="module" src="/frontend/index.tsx"></script>
      </body>
      </html>`,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  // Individual checkin pages - /checkins/:did/:rkey
  app.get("/checkins/:did/:rkey", async (c) => {
    const did = c.req.param("did");
    const rkey = c.req.param("rkey");
    const checkinId = `${did}/${rkey}`;
    return await renderCheckinPage(c, checkinId);
  });

  // Catch-all route for SPA
  app.get("*", (_c) => serveFile("/frontend/index.html", import.meta.url));

  return app;
}
