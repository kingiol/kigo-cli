import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";

describe("ToolRegistry sources", () => {
  it("applies source precedence plugin > local > builtin", async () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "sample_tool",
      description: "builtin",
      schema: z.object({}),
      execute: async () => "builtin",
    });

    registry.registerExternal(
      {
        name: "sample_tool",
        description: "local",
        parameters: {},
        execute: async () => "local",
      },
      "local",
      "./.kigo/tools/sample.ts",
    );

    registry.registerExternal(
      {
        name: "sample_tool",
        description: "plugin",
        parameters: {},
        execute: async () => "plugin",
      },
      "plugin",
      "npm:demo-plugin",
    );

    const tool = registry.get("sample_tool");
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result).toBe("plugin");

    const catalog = registry.getCatalog();
    expect(catalog.find((item) => item.name === "sample_tool")?.source).toBe("plugin");
  });

  it("clears tools by source", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "builtin_tool",
      description: "builtin",
      schema: z.object({}),
      execute: async () => "ok",
    });

    registry.registerExternal(
      {
        name: "local_tool",
        description: "local",
        parameters: {},
        execute: async () => "ok",
      },
      "local",
    );

    registry.clearBySource(["local"]);

    expect(registry.get("builtin_tool")).toBeDefined();
    expect(registry.get("local_tool")).toBeUndefined();
  });
});
