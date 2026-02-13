/**
 * Build script for the frontend bundle.
 * Uses esbuild to bundle all frontend TypeScript/TSX into a single JavaScript file.
 * Generates content-hashed filenames for optimal caching.
 */

import * as esbuild from "esbuild";
import { encodeHex } from "@std/encoding/hex";

const startTime = Date.now();

async function generateContentHash(content: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  return encodeHex(new Uint8Array(hashBuffer)).slice(0, 8);
}

async function cleanOldBundles(currentBundleName: string): Promise<void> {
  try {
    for await (const entry of Deno.readDir("static")) {
      if (
        entry.isFile &&
        entry.name.startsWith("bundle.") &&
        entry.name !== currentBundleName &&
        entry.name !== `${currentBundleName}.map`
      ) {
        await Deno.remove(`static/${entry.name}`);
        console.log(`   Cleaned: ${entry.name}`);
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.warn("Warning: Could not clean old bundles:", error);
    }
  }
}

try {
  const result = await esbuild.build({
    entryPoints: ["frontend/index.tsx"],
    bundle: true,
    format: "esm",
    outfile: "bundle.js",
    write: false,
    jsx: "automatic",
    jsxImportSource: "https://esm.sh/react@19",
    minify: true,
    sourcemap: true,
    target: ["es2020"],
    alias: {
      "react": "https://esm.sh/react@19",
      "react-dom/client": "https://esm.sh/react-dom@19/client",
    },
    metafile: true,
  });

  const bundleOutput = result.outputFiles?.find(
    (f) => f.path.endsWith(".js") && !f.path.endsWith(".js.map"),
  );
  const sourcemapOutput = result.outputFiles?.find((f) =>
    f.path.endsWith(".js.map")
  );

  if (!bundleOutput) {
    throw new Error("No bundle output found");
  }

  const contentHash = await generateContentHash(bundleOutput.contents);
  const bundleFileName = `bundle.${contentHash}.js`;
  const bundlePath = `static/${bundleFileName}`;

  await Deno.mkdir("static", { recursive: true });
  await Deno.writeFile(bundlePath, bundleOutput.contents);

  if (sourcemapOutput) {
    const sourcemapContent = new TextDecoder().decode(sourcemapOutput.contents);
    const updatedSourcemap = sourcemapContent.replace(
      /"file":\s*"[^"]*"/,
      `"file": "${bundleFileName}"`,
    );
    await Deno.writeTextFile(`${bundlePath}.map`, updatedSourcemap);
  }

  const manifest = {
    "bundle.js": bundleFileName,
    buildTime: new Date().toISOString(),
  };
  await Deno.writeTextFile("static/manifest.json", JSON.stringify(manifest));

  await cleanOldBundles(bundleFileName);

  const elapsed = Date.now() - startTime;
  const outputSizeKB = (bundleOutput.contents.length / 1024).toFixed(1);

  console.log(`✅ Frontend bundle built in ${elapsed}ms`);
  console.log(`   Output: ${bundlePath} (${outputSizeKB} KB)`);
  console.log(`   Hash: ${contentHash}`);
} catch (error) {
  console.error("❌ Build failed:", error);
  Deno.exit(1);
} finally {
  esbuild.stop();
}
