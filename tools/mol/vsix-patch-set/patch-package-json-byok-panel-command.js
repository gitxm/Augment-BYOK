#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const COMMAND_ID = "vscode-augment.byok.settings";

function patchPackageJsonByokPanelCommand(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(`"command": "${COMMAND_ID}"`)) return { changed: false, reason: "already_patched" };

  const re = /("commands"\s*:\s*\[\n)(\s*)\{/m;
  const m = original.match(re);
  if (!m) throw new Error(`failed to locate contributes.commands array (pattern: "commands": [)`);

  const indent = m[2] || "";
  const entry =
    `${m[1]}` +
    `${indent}{\n` +
    `${indent}  "category": "Augment",\n` +
    `${indent}  "command": "${COMMAND_ID}",\n` +
    `${indent}  "title": "BYOK: Settings..."\n` +
    `${indent}},\n` +
    `${indent}{`;

  const next = original.replace(re, entry);
  fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, reason: "patched" };
}

module.exports = { patchPackageJsonByokPanelCommand };

if (require.main === module) {
  const p = process.argv[2];
  if (!p) {
    console.error(`usage: ${path.basename(process.argv[1])} <extension/package.json>`);
    process.exit(2);
  }
  patchPackageJsonByokPanelCommand(p);
}

