#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const MARKER = "__augment_byok_llm_endpoint_router_patched";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeEndpoint(ep) {
  const s = typeof ep === "string" ? ep.trim() : "";
  return s.replace(/^\/+/, "");
}

function patchLlmEndpointRouter(filePath, { llmEndpoints }) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes(MARKER)) return { changed: false, reason: "already_patched" };

  const endpoints = Array.isArray(llmEndpoints) ? llmEndpoints.map(normalizeEndpoint).filter(Boolean) : [];
  if (endpoints.length === 0) throw new Error("llmEndpoints empty");

  const endpointsLiteral = JSON.stringify(endpoints);

  const injectStreamNeedle = "async callApiStream(t,r,n,i,o=d=>d,s,a,c,l,u=!1){";
  const injectApiNeedle = "async callApi(t,r,n,i,o=p=>p,s,a,c,l,u=!1,d,f){";

  if (!original.includes(injectStreamNeedle)) throw new Error(`callApiStream needle not found (upstream changed?): ${injectStreamNeedle}`);
  if (!original.includes(injectApiNeedle)) throw new Error(`callApi needle not found (upstream changed?): ${injectApiNeedle}`);

  const streamInjection =
    `${injectStreamNeedle}` +
    `const __byok_ep=typeof n==\"string\"?n.replace(/^\\/+/,\"\"):\"\";const __byok_set=(globalThis.__augment_byok_llm_endpoints_set??=new Set(${endpointsLiteral}));if(__byok_set.has(__byok_ep)){const __byok_res=await require(\"./byok/coord/byok-routing/llm-router\").maybeHandleCallApiStream({requestId:t,endpoint:__byok_ep,body:i,transform:o,timeoutMs:a,abortSignal:l,upstreamBaseUrl:s,upstreamApiToken:r.apiToken});if(__byok_res!==void 0)return __byok_res;}`;

  const apiInjection =
    `${injectApiNeedle}` +
    `const __byok_ep=typeof n==\"string\"?n.replace(/^\\/+/,\"\"):\"\";const __byok_set=(globalThis.__augment_byok_llm_endpoints_set??=new Set(${endpointsLiteral}));if(__byok_set.has(__byok_ep)){const __byok_res=await require(\"./byok/coord/byok-routing/llm-router\").maybeHandleCallApi({requestId:t,endpoint:__byok_ep,body:i,transform:o,timeoutMs:a,abortSignal:l,upstreamBaseUrl:s,upstreamApiToken:(d??r.apiToken)});if(__byok_res!==void 0)return __byok_res;}`;

  let next = original.split(injectStreamNeedle).join(streamInjection);
  next = next.split(injectApiNeedle).join(apiInjection);

  next = next + `\n;/*${MARKER}*/\n`;
  fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, reason: "patched", endpoints: endpoints.length };
}

module.exports = { patchLlmEndpointRouter };

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, "../../..");
  const p = process.argv[2];
  if (!p) {
    console.error(`usage: ${path.basename(process.argv[1])} <extension/out/extension.js>`);
    process.exit(2);
  }
  const llm = readJson(path.join(repoRoot, "config", "byok-routing", "llm-endpoints.json"));
  patchLlmEndpointRouter(p, { llmEndpoints: llm?.endpoints });
}
