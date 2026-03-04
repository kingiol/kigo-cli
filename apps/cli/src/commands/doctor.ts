import { Command } from "commander";
import { getConfigManager } from "../config/ConfigManager.js";
import { ProviderRegistry } from "@kigo/core";

export function doctorCommands(program: Command): void {
  const doctorCmd = program.command("doctor").description("Diagnostics commands");

  doctorCmd
    .command("providers")
    .description("Validate provider configuration (local checks only)")
    .action(async () => {
      const manager = getConfigManager();
      await manager.load();

      const provider = manager.getProvider();
      const descriptor = ProviderRegistry.getDescriptor(provider);
      const providerConfig = manager.getProviderConfig();
      const capabilities = ProviderRegistry.getCapabilities(providerConfig.provider, providerConfig.model);

      console.log("Provider diagnostics:");
      console.log(`  Provider: ${providerConfig.provider}`);
      console.log(`  Canonical: ${ProviderRegistry.resolveProviderId(providerConfig.provider)}`);
      console.log(`  Model: ${providerConfig.model || "(unset)"}`);
      console.log(`  API key: ${providerConfig.apiKey ? "present" : "missing"}`);
      console.log(`  Base URL: ${providerConfig.baseURL || "(unset)"}`);
      console.log(`  Azure API version: ${providerConfig.azureApiVersion || "(unset)"}`);
      console.log(`  Reasoning effort: ${providerConfig.reasoningEffort || "(unset)"}`);

      if (!descriptor) {
        console.log("  Status: unsupported provider id");
        process.exitCode = 1;
        return;
      }

      if (descriptor.requiresApiKey && !providerConfig.apiKey && providerConfig.provider !== "ollama") {
        console.log("  Status: missing required API key");
        process.exitCode = 1;
        return;
      }

      if (descriptor.requiresBaseURL && !providerConfig.baseURL) {
        console.log("  Status: missing required base URL");
        process.exitCode = 1;
        return;
      }

      console.log(`  Capabilities: tool_calling=${capabilities.tool_calling}, json_output=${capabilities.json_output}, reasoning_effort=${capabilities.reasoning_effort}, response_api_mode=${capabilities.response_api_mode}`);
      console.log("  Status: ok");
    });
}
