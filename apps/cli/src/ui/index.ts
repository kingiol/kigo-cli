import { getConfigManager } from "../config/ConfigManager.js";
import { runInteractive } from "../interactive.js";
import { runInteractiveInk } from "./ink.js";
import type { InteractiveOptions } from "../interactive/runtime.js";

const UI_ENV_KEY = "KODER_UI";

function resolveUiMode(value: string | undefined): "legacy" | "ink" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "ink") {
    return "ink";
  }
  return "legacy";
}

export async function runInteractiveWithUI(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions,
): Promise<void> {
  const uiMode = resolveUiMode(process.env[UI_ENV_KEY]);
  if (uiMode === "ink") {
    await runInteractiveInk(configManager, options);
    return;
  }
  await runInteractive(configManager, options);
}
