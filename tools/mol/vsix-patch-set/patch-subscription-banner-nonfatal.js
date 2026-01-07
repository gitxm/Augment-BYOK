#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const MARKER = "__augment_byok_subscription_banner_nonfatal_patched";

function patchSubscriptionBannerNonfatal(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(MARKER)) return { changed: false, reason: "already_patched" };

  const needle = "catch(n){throw this._logger.error(`Failed to get subscription banner: ${String(n)}`),n}}";
  if (!original.includes(needle)) throw new Error(`subscription banner needle not found (upstream changed?): ${needle}`);

  const replacement =
    "catch(n){this._logger.error(`Failed to get subscription banner: ${String(n)}`);return{type:\"get-subscription-banner-response\",data:{banner:void 0}}}}";

  const next = original.split(needle).join(replacement) + `\n;/*${MARKER}*/\n`;
  fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, reason: "patched" };
}

module.exports = { patchSubscriptionBannerNonfatal };

if (require.main === module) {
  const p = process.argv[2];
  if (!p) {
    console.error(`usage: ${path.basename(process.argv[1])} <extension/out/extension.js>`);
    process.exit(2);
  }
  patchSubscriptionBannerNonfatal(p);
}

