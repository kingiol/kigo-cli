import { getConfigManager } from "../config/ConfigManager.js";
import { createInteractiveRuntime } from "../interactive/runtime.js";
import type { InteractiveOptions, RuntimeEvent } from "../interactive/runtimeTypes.js";

function writePendingNewlineIfNeeded(state: { pendingLine: string }): void {
  if (state.pendingLine.length > 0) {
    process.stdout.write("\n");
    state.pendingLine = "";
  }
}

function handleRuntimeEvent(
  event: RuntimeEvent,
  state: { pendingLine: string },
): void {
  if (event.type === "text_delta") {
    state.pendingLine += event.data;
    process.stdout.write(event.data);
    return;
  }

  if (event.type === "tool_call") {
    writePendingNewlineIfNeeded(state);
    process.stdout.write(`\n[tool] ${event.toolName || event.data?.name || "unknown"}\n`);
    return;
  }

  if (event.type === "tool_output") {
    writePendingNewlineIfNeeded(state);
    const payload = event.data?.error ? `Error: ${event.data.error}` : (event.data?.result || "");
    if (payload) {
      process.stdout.write(`${payload}\n`);
    }
    return;
  }

  if (event.type === "error") {
    writePendingNewlineIfNeeded(state);
    process.stderr.write(`Error: ${event.data}\n`);
  }
}

export async function runSinglePrompt(
  prompt: string,
  options: InteractiveOptions,
): Promise<void> {
  const configManager = getConfigManager();
  await configManager.load();

  const runtime = await createInteractiveRuntime(configManager, options);
  const state = { pendingLine: "" };

  try {
    await runtime.runInput(prompt, (event) => {
      handleRuntimeEvent(event, state);
    });
    writePendingNewlineIfNeeded(state);
  } finally {
    await runtime.close();
  }
}
