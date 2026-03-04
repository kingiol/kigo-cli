import { describe, it, expect } from "vitest";
import * as config from "@kigo/config";

describe("@kingiol/kigo-cli", () => {
  it("should export config schemas", () => {
    expect(config.KigoConfigSchema).toBeDefined();
    expect(config.ModelConfigSchema).toBeDefined();
    expect(config.DEFAULT_CONFIG).toBeDefined();
  });

  it("should parse MCP server envVars and headers", () => {
    const parsed = config.KigoConfigSchema.parse({
      mcpServers: [
        {
          name: "test",
          transportType: "http",
          url: "http://localhost:1234",
          envVars: { FOO: "bar" },
          headers: { Authorization: "Bearer token" },
        },
      ],
    });

    expect(parsed.mcpServers[0]?.envVars).toEqual({ FOO: "bar" });
    expect(parsed.mcpServers[0]?.headers).toEqual({
      Authorization: "Bearer token",
    });
  });

  it("should parse permissions config", () => {
    const parsed = config.KigoConfigSchema.parse({
      permissions: {
        allow: ["read_*"],
        block: ["Bash(rm -rf *)"],
        dontAsk: true,
      },
    });

    expect(parsed.permissions.allow).toEqual(["read_*"]);
    expect(parsed.permissions.block).toEqual(["Bash(rm -rf *)"]);
    expect(parsed.permissions.dontAsk).toBe(true);
  });

  it("should support new providers/plugins/tools config fields", () => {
    const parsed = config.KigoConfigSchema.parse({
      model: { name: "gpt-4o", provider: "openai" },
      providers: {
        openai: {
          model: "gpt-4o",
          baseUrl: "https://api.openai.com/v1",
          options: {},
        },
      },
      plugins: [
        {
          name: "local-dev-plugin",
          source: "file",
          spec: "./.kigo/plugins/dev-plugin.ts",
          enabled: true,
          options: {},
        },
      ],
      tools: {
        loadPaths: [".kigo/tool", ".opencode/tools"],
        timeoutMs: 30000,
        maxOutputChars: 8000,
      },
    });

    expect(parsed.providers.openai?.model).toBe("gpt-4o");
    expect(parsed.plugins.length).toBe(1);
    expect(parsed.tools.timeoutMs).toBe(30000);
  });
});
