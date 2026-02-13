/**
 * File server utilities for serving static files.
 * Replaces Val Town's serveFile with local filesystem reads.
 * Includes cache headers for optimal performance.
 */

import { dirname, fromFileUrl, join } from "@std/path";
import { contentType } from "@std/media-types";

const CACHE_IMMUTABLE = 31536000; // 1 year
const CACHE_MEDIUM = 3600; // 1 hour
const CACHE_SHORT = 60; // 1 minute

function getCacheControl(path: string): string {
  const filename = path.split("/").pop() || "";

  // Content-hashed bundle files - immutable
  if (/^bundle\.[a-f0-9]{8}\.js(\.map)?$/.test(filename)) {
    return `public, max-age=${CACHE_IMMUTABLE}, immutable`;
  }

  if (filename.endsWith(".js") || filename.endsWith(".css")) {
    return `public, max-age=${CACHE_MEDIUM}`;
  }

  if (filename.endsWith(".html")) {
    return `public, max-age=${CACHE_SHORT}, must-revalidate`;
  }

  return `public, max-age=${CACHE_MEDIUM}`;
}

/**
 * Resolve a path relative to the project root.
 * Works on both local development (file://) and Deno Deploy (app://).
 */
function resolveProjectPath(path: string, baseUrl: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrlObj = new URL(baseUrl);

  if (baseUrlObj.protocol === "file:") {
    const baseDir = dirname(fromFileUrl(baseUrl));
    return join(baseDir, cleanPath);
  } else {
    // Deno Deploy (app://) - resolve relative to base
    const basePath = dirname(baseUrlObj.pathname);
    return join(basePath, cleanPath);
  }
}

/**
 * Read a file from the project relative to the given base URL.
 */
export async function readFile(
  path: string,
  baseUrl: string,
): Promise<string> {
  const filePath = resolveProjectPath(path, baseUrl);
  return await Deno.readTextFile(filePath);
}

/**
 * Serve a file with appropriate content-type and cache headers.
 * Drop-in replacement for Val Town's serveFile.
 */
export async function serveFile(
  path: string,
  baseUrl: string,
): Promise<Response> {
  try {
    const ext = path.split(".").pop() || "";
    const content = await readFile(path, baseUrl);
    const mimeType = contentType(ext) || "application/octet-stream";
    const cacheControl = getCacheControl(path);

    return new Response(content, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
