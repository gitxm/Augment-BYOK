import { AUGMENT_BYOK } from "../constants";
import type { InstallArgs } from "../types";
import { registerByokPanel } from "../coord/byok-panel/register-byok-panel";
import { installSettingsMemoriesRpc } from "../coord/vsix-patch-set/install-settings-memories-rpc";

export function install({ vscode, getActivate, setActivate }: InstallArgs): void {
  if (typeof getActivate !== "function" || typeof setActivate !== "function") return;
  if ((globalThis as any)[AUGMENT_BYOK.patchedGlobalKey]) return;

  const originalActivate = getActivate();
  if (typeof originalActivate !== "function") return;
  (globalThis as any)[AUGMENT_BYOK.patchedGlobalKey] = true;

  setActivate(async (context: any) => {
    const logger = console;
    try {
      (globalThis as any)[AUGMENT_BYOK.extensionContextGlobalKey] = context;
    } catch {
      // ignore
    }
    installSettingsMemoriesRpc({ vscode, context, logger });
    registerByokPanel({ vscode, context, logger });
    return await (originalActivate as any)(context);
  });
}
