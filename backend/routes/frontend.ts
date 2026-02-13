// Frontend and static content routes
import type { App } from "@fresh/core";
import { serveFile } from "../utils/file-server.ts";
import {
  resolveHandleToDid,
  resolvePdsUrl,
  resolveProfileFromPds,
} from "../utils/atproto-resolver.ts";

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
    // Parse string coordinates back to numbers for rendering
    const rawCoords = checkinData.value.coordinates;
    const coordinates = {
      latitude: parseFloat(rawCoords.latitude),
      longitude: parseFloat(rawCoords.longitude),
    };

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
      coordinates,
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

export function registerFrontendRoutes(
  app: App<any>,
  moduleUrl: string,
): App<any> {
  // Static file serving
  app = app.get("/frontend/:path*", (ctx) => {
    const url = new URL(ctx.req.url);
    return serveFile(url.pathname, moduleUrl);
  });
  app = app.get("/shared/:path*", (ctx) => {
    const url = new URL(ctx.req.url);
    return serveFile(url.pathname, moduleUrl);
  });

  // Terms of Service - serve React app
  app = app.get(
    "/terms",
    () => serveFile("/frontend/index.html", moduleUrl),
  );

  // Privacy Policy - redirect to the full React privacy policy page
  app = app.get("/privacy", () => {
    return new Response(null, {
      status: 301,
      headers: { Location: "/privacy-policy" },
    });
  });

  // Individual checkin pages - /checkins/:did/:rkey (new format)
  app = app.get("/checkins/:did/:rkey", async (ctx) => {
    const url = new URL(ctx.req.url);
    const parts = url.pathname.split("/");
    const did = parts[2];
    const rkey = parts[3];
    const checkinId = `${did}/${rkey}`;
    return await renderCheckinPage(ctx.req.url, checkinId, moduleUrl);
  });

  // Legacy checkin URL format - /checkin/:identifier/:rkey (singular)
  app = app.get("/checkin/:identifier/:rkey", async (ctx) => {
    const url = new URL(ctx.req.url);
    const parts = url.pathname.split("/");
    const identifier = parts[2];
    const rkey = parts[3];
    const checkinId = `${identifier}/${rkey}`;
    return await renderCheckinPage(ctx.req.url, checkinId, moduleUrl);
  });

  // Mobile auth page
  app = app.get(
    "/mobile-auth",
    () => serveFile("/frontend/mobile-auth-simple.html", moduleUrl),
  );

  // Catch-all route for SPA
  app = app.get("*", () => serveFile("/frontend/index.html", moduleUrl));

  return app;
}

// Helper function to render checkin page with meta tags
async function renderCheckinPage(
  requestUrl: string,
  checkinId: string,
  _moduleUrl: string,
) {
  let metaTitle = "Anchor Check-in";
  let metaDescription = "View this check-in on Anchor";
  let metaImage = "https://cdn.dropanchor.app/images/anchor-logo.png";
  let metaImageType = "image/png";
  let checkinData = null;

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

    if (checkin.text) {
      metaTitle = checkin.text;
    } else {
      metaTitle = `${authorName} dropped anchor at ${locationName}`;
    }

    const locationParts = [
      checkin.address?.name,
      checkin.address?.locality,
      checkin.address?.region,
      checkin.address?.country,
    ].filter(Boolean);
    metaDescription = locationParts.length > 0
      ? `${authorName} at ${locationParts.join(", ")}`
      : `Check-in by ${authorName}`;

    if (checkin.image?.fullsizeUrl) {
      metaImage = checkin.image.fullsizeUrl;
      if (checkin.image.fullsizeUrl.includes("image/jpeg")) {
        metaImageType = "image/jpeg";
      } else if (checkin.image.fullsizeUrl.includes("image/png")) {
        metaImageType = "image/png";
      } else if (checkin.image.fullsizeUrl.includes("image/webp")) {
        metaImageType = "image/webp";
      } else {
        metaImageType = "image/jpeg";
      }
    }
  }

  const safeTitle = escapeHtml(metaTitle);
  const safeDescription = escapeHtml(metaDescription);

  // Build noscript content with checkin details
  let noscriptContent = `
      <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="font-size: 1.5rem; margin: 0 0 1rem 0; color: #1a1a1a;">${safeTitle}</h1>`;

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
        <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #007aff; color: white; text-decoration: none; border-radius: 4px; font-weight: 600;">← View All Check-ins</a>
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
        <meta property="og:url" content="${requestUrl}">
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

      </head>
      <body style="margin: 0; background: #f8fafc;">
        <!-- React app root -->
        <div id="root" style="background: #f8fafc; min-height: 100vh"></div>

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
