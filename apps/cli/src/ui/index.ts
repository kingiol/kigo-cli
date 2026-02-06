import { getConfigManager } from "../config/ConfigManager.js";
import { runInteractiveInk } from "./ink.js";
import type { InteractiveOptions } from "../interactive/runtime.js";

export async function runInteractiveWithUI(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions,
): Promise<void> {
  await runInteractiveInk(configManager, options);
}