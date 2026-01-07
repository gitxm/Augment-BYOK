#!/usr/bin/env node
"use strict";

const path = require("path");
const { syncUpstreamLatest } = require("../../atom/upstream-vsix");

async function main() {
  const repoRoot = path.resolve(__dirname, "../../..");
  const cacheDir = path.join(repoRoot, ".cache");
  await syncUpstreamLatest({ repoRoot, cacheDir, loggerPrefix: "[upstream]" });
}

main().catch((err) => {
  console.error(`[upstream] ERROR:`, err && err.stack ? err.stack : String(err));
  process.exit(1);
});
