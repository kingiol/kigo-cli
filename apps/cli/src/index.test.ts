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
});
