export type InstallArgs = {
  vscode: any;
  getActivate: () => unknown;
  setActivate: (next: unknown) => void;
};

export type ByokProviderType = "openai_compatible" | "anthropic_native";

export type ByokProvider = {
  id: string;
  type: ByokProviderType;
  baseUrl: string;
  defaultModel?: string;
};

export type ByokRouting = {
  activeProviderId: string;
  routes?: Record<string, string>;
  models?: Record<string, string>;
};

export type ByokDefaults = {
  requestTimeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
};

export type ByokConfigV1 = {
  version: 1;
  enabled?: boolean;
  proxy?: { baseUrl: string };
  providers: ByokProvider[];
  routing: ByokRouting;
  defaults?: ByokDefaults;
};

export type ByokProviderSecrets = {
  apiKey?: string;
  token?: string;
};

export type ByokResolvedProvider = ByokProvider & { secrets: ByokProviderSecrets };

export type ByokResolvedDefaults = ByokDefaults & { requestTimeoutMs: number };

export type ByokResolvedConfigV1 = Omit<ByokConfigV1, "defaults" | "providers"> & {
  providers: ByokResolvedProvider[];
  defaults: ByokResolvedDefaults;
  proxy: { baseUrl: string; token?: string };
};

export type ByokExportV1 = {
  version: 1;
  config: ByokConfigV1;
  secrets: { proxy: { token?: string | null }; providers: Record<string, { apiKey?: string | null; token?: string | null }> };
  meta: { exportedAt: string; redacted: boolean };
};
