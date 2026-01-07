#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  extractContextKeysFromExtensionJs,
  extractContextToFlagsFromExtensionJs,
  extractFeatureFlagKeysFromExtensionJs,
  extractUpstreamApiCallsFromExtensionJs
} = require("../../atom/upstream-analysis");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = { unpackDir: "", out: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--unpack-dir") args.unpackDir = argv[++i] || "";
    else if (a === "--out") args.out = argv[++i] || "";
  }
  return args;
}

function main() {
  const repoRoot = path.resolve(__dirname, "../../..");
  const args = parseArgs(process.argv.slice(2));

  const unpackDir = args.unpackDir ? path.resolve(repoRoot, args.unpackDir) : path.join(repoRoot, ".cache", "upstream", "unpacked", "latest");
  const extensionDir = path.join(unpackDir, "extension");
  const pkgPath = path.join(extensionDir, "package.json");
  const extensionJsPath = path.join(extensionDir, "out", "extension.js");

  if (!fs.existsSync(pkgPath) || !fs.existsSync(extensionJsPath)) {
    console.error(`[analyze] upstream not synced; run: pnpm upstream:sync`);
    process.exit(1);
  }

  const pkg = readJson(pkgPath);
  const version = typeof pkg.version === "string" ? pkg.version : "unknown";

  const src = fs.readFileSync(extensionJsPath, "utf8");
  const { endpoints, endpointDetails } = extractUpstreamApiCallsFromExtensionJs(src);
  const contextKeys = extractContextKeysFromExtensionJs(src);
  const featureFlags = extractFeatureFlagKeysFromExtensionJs(src);
  const contextKeyToFeatureFlags = extractContextToFlagsFromExtensionJs(src);

  const report = {
    generatedAtMs: Date.now(),
    upstream: {
      publisher: "augment",
      extension: "vscode-augment",
      version,
      unpackDir: path.relative(repoRoot, unpackDir)
    },
    endpoints,
    endpointDetails,
    contextKeys,
    featureFlags,
    contextKeyToFeatureFlags,
    stats: { endpointCount: endpoints.length, contextKeyCount: contextKeys.length, featureFlagKeyCount: { v1: featureFlags.v1.length, v2: featureFlags.v2.length } }
  };

  const outPath = args.out
    ? path.resolve(repoRoot, args.out)
    : path.join(repoRoot, ".cache", "reports", `upstream-endpoints.${version}.json`);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  const latestPath = path.join(repoRoot, ".cache", "reports", "upstream-analysis.json");
  if (path.resolve(latestPath) !== path.resolve(outPath)) fs.writeFileSync(latestPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`[analyze] upstream: augment.vscode-augment@${version}`);
  console.log(`[analyze] endpoints: ${endpoints.length}`);
  console.log(`[analyze] context keys: ${contextKeys.length}`);
  console.log(`[analyze] feature flags: v1=${featureFlags.v1.length} v2=${featureFlags.v2.length}`);
  console.log(`[analyze] report: ${path.relative(repoRoot, outPath)}`);
  if (path.resolve(latestPath) !== path.resolve(outPath)) console.log(`[analyze] report: ${path.relative(repoRoot, latestPath)}`);
}

main();
