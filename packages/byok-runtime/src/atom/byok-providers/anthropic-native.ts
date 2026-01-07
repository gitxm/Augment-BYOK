import { parseSse } from "../common/sse";

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as any).name === "AbortError";
}

async function safeFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (isAbortError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} fetch 失败: ${msg} (url=${url})`);
  }
}

function joinBaseUrl(baseUrl: string, endpoint: string): string {
  const b = normalizeString(baseUrl);
  const e = normalizeString(endpoint).replace(/^\/+/, "");
  if (!b || !e) return "";
  const base = b.endsWith("/") ? b : `${b}/`;
  return `${base}${e}`;
}

function buildAbortSignal(timeoutMs: number, abortSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!abortSignal) return timeout;
  const anyFn = (AbortSignal as any).any;
  if (typeof anyFn === "function") return anyFn([timeout, abortSignal]);
  const ac = new AbortController();
  const abort = (s: AbortSignal) => {
    try {
      ac.abort((s as any).reason);
    } catch {
      ac.abort();
    }
  };
  if (timeout.aborted) abort(timeout);
  else timeout.addEventListener("abort", () => abort(timeout), { once: true });
  if (abortSignal.aborted) abort(abortSignal);
  else abortSignal.addEventListener("abort", () => abort(abortSignal), { once: true });
  return ac.signal;
}

export type AnthropicMessage = { role: "user" | "assistant"; content: string };
export type AnthropicTool = { name: string; description?: string; input_schema: any };
export type AnthropicToolUse = { id: string; name: string; input: any };
export type AnthropicCompleteWithToolsResult =
  | { kind: "final"; text: string }
  | { kind: "tool_calls"; toolUses: AnthropicToolUse[]; assistantText: string; contentBlocks: any[] };

export async function anthropicComplete({
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  abortSignal
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  maxTokens: number;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const url = joinBaseUrl(baseUrl, "v1/messages");
  if (!url) throw new Error("Anthropic baseUrl 无效");
  const key = normalizeString(apiKey);
  if (!key) throw new Error("Anthropic apiKey 未配置");

  const body: any = { model, max_tokens: maxTokens, messages, stream: false };
  if (system) body.system = system;
  if (typeof temperature === "number") body.temperature = temperature;

  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: buildAbortSignal(timeoutMs, abortSignal)
    },
    "Anthropic"
  );

  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Anthropic 请求失败: ${resp.status} ${text.slice(0, 200)}`.trim());
  const json = text ? JSON.parse(text) : null;
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const out = blocks.map((b: any) => (b && b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  if (!out) throw new Error("Anthropic 响应缺少 content[].text");
  return out;
}

export async function anthropicCompleteWithTools({
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  tools,
  temperature,
  maxTokens,
  timeoutMs,
  abortSignal
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: any[];
  tools: AnthropicTool[];
  temperature?: number;
  maxTokens: number;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<AnthropicCompleteWithToolsResult> {
  const url = joinBaseUrl(baseUrl, "v1/messages");
  if (!url) throw new Error("Anthropic baseUrl 无效");
  const key = normalizeString(apiKey);
  if (!key) throw new Error("Anthropic apiKey 未配置");

  const body: any = { model, max_tokens: maxTokens, messages, tools, stream: false };
  if (system) body.system = system;
  if (typeof temperature === "number") body.temperature = temperature;

  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: buildAbortSignal(timeoutMs, abortSignal)
    },
    "Anthropic"
  );

  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Anthropic 请求失败: ${resp.status} ${text.slice(0, 200)}`.trim());
  const json = text ? JSON.parse(text) : null;
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const assistantText = blocks.map((b: any) => (b && b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
  const toolUses = blocks
    .map((b: any) => (b && b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string" ? ({ id: b.id, name: b.name, input: b.input } as AnthropicToolUse) : null))
    .filter(Boolean) as AnthropicToolUse[];
  if (toolUses.length) return { kind: "tool_calls", toolUses, assistantText, contentBlocks: blocks };
  if (!assistantText) throw new Error("Anthropic 响应缺少 content[].text/tool_use");
  return { kind: "final", text: assistantText };
}

export async function* anthropicStream({
  baseUrl,
  apiKey,
  model,
  system,
  messages,
  temperature,
  maxTokens,
  timeoutMs,
  abortSignal
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  maxTokens: number;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): AsyncGenerator<string> {
  const url = joinBaseUrl(baseUrl, "v1/messages");
  if (!url) throw new Error("Anthropic baseUrl 无效");
  const key = normalizeString(apiKey);
  if (!key) throw new Error("Anthropic apiKey 未配置");

  const body: any = { model, max_tokens: maxTokens, messages, stream: true };
  if (system) body.system = system;
  if (typeof temperature === "number") body.temperature = temperature;

  const resp = await safeFetch(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: buildAbortSignal(timeoutMs, abortSignal)
    },
    "Anthropic"
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Anthropic stream 请求失败: ${resp.status} ${text.slice(0, 200)}`.trim());
  }

  for await (const ev of parseSse(resp)) {
    const data = ev.data;
    if (!data) continue;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    if (json?.type === "content_block_delta" && json?.delta?.type === "text_delta" && typeof json?.delta?.text === "string") {
      yield json.delta.text;
    }
  }
}

export async function anthropicListModels({
  baseUrl,
  apiKey,
  timeoutMs,
  abortSignal
}: {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<string[]> {
  const url = joinBaseUrl(baseUrl, "v1/models");
  if (!url) throw new Error("Anthropic baseUrl 无效");
  const key = normalizeString(apiKey);
  if (!key) throw new Error("Anthropic apiKey 未配置");

  const resp = await safeFetch(
    url,
    {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: buildAbortSignal(timeoutMs, abortSignal)
    },
    "Anthropic"
  );

  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`Anthropic models 请求失败: ${resp.status} ${text.slice(0, 200)}`.trim());
  const json = text ? JSON.parse(text) : null;
  const data = Array.isArray(json?.data) ? json.data : null;
  if (!data) throw new Error("Anthropic models 响应缺少 data[]");
  const models = data.map((m: any) => (m && typeof m.id === "string" ? m.id : "")).filter(Boolean);
  models.sort();
  return models;
}
