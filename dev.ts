#!/usr/bin/env -S deno run -A --watch=backend/,frontend/
/**
 * Development server for Anchor.
 * Uses Fresh with hot reload for development.
 */

import { Builder } from "fresh/dev";

const builder = new Builder();

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen(() => import("./main.ts"));
}
