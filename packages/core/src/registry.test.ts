import { describe, expect, it } from "vitest";
import { AgentRegistry } from "./agent/AgentRegistry.js";
import { ExecutionModeController } from "./agent/ExecutionMode.js";
import { ProviderRegistry } from "./models/ProviderRegistry.js";

describe("Agent and Provider registries", () => {
  it("switches execution mode and enforces plan restrictions", () => {
    const registry = new AgentRegistry();
    const mode = new ExecutionModeController(registry, "build");

    expect(mode.isPlanMode()).toBe(false);
    expect(mode.setActiveAgent("plan")).toBe(true);
    expect(mode.isPlanMode()).toBe(true);
    expect(mode.evaluateTool("write_file").allowed).toBe(false);
    expect(mode.evaluateTool("read_file").allowed).toBe(true);
  });

  it("resolves openai-compatible aliases", () => {
    expect(ProviderRegistry.resolveProviderId("openrouter")).toBe("openai-compatible");
    expect(ProviderRegistry.resolveProviderId("openai")).toBe("openai");
  });

  it("returns capability metadata", () => {
    const caps = ProviderRegistry.getCapabilities("openai", "gpt-5");
    expect(caps.tool_calling).toBe(true);
    expect(caps.response_api_mode).toBe("responses");
  });
});
