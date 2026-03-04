import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  KigoPlugin,
  LoadedExternalTool,
  PluginEntry,
  PluginExecutionContext,
  PluginToolDefinition,
} from "./types.js";

const TOOL_FILE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts"]);

function toToolName(base: string, exportName: string): string {
  if (exportName === "default") {
    return base;
  }
  return `${base}_${exportName}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function hasExecute(value: unknown): value is { execute: (...args: unknown[]) => unknown } {
  return isObject(value) && typeof value.execute === "function";
}

function buildToolParameters(definition: PluginToolDefinition): Record<string, unknown> {
  if (definition.parameters && isObject(definition.parameters)) {
    return definition.parameters;
  }

  if (definition.schema && typeof definition.schema.safeParse === "function") {
    return (zodToJsonSchema(definition.schema) || {}) as Record<string, unknown>;
  }

  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

async function loadModule(spec: string, source: "file" | "npm", cwd: string): Promise<Record<string, unknown>> {
  if (source === "npm") {
    return (await import(spec)) as Record<string, unknown>;
  }

  const target = path.isAbsolute(spec) ? spec : path.resolve(cwd, spec);
  const url = pathToFileURL(target).href;
  return (await import(url)) as Record<string, unknown>;
}

async function listFilesUnder(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(dir, entry.name))
      .filter((file) => TOOL_FILE_EXTENSIONS.has(path.extname(file)));
  } catch {
    return [];
  }
}

function normalizeOutput(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result, null, 2);
}

export class PluginManager {
  constructor(private readonly cwd: string) {}

  async loadPlugins(entries: PluginEntry[]): Promise<{ plugins: KigoPlugin[]; tools: LoadedExternalTool[] }> {
    const plugins: KigoPlugin[] = [];
    const tools: LoadedExternalTool[] = [];

    for (const entry of entries) {
      if (!entry.enabled) {
        continue;
      }

      try {
        const mod = await loadModule(entry.spec, entry.source, this.cwd);
        const candidate = this.extractPlugin(mod, entry.name);
        if (!candidate) {
          continue;
        }

        plugins.push(candidate);

        for (const [name, definition] of Object.entries(candidate.tools || {})) {
          tools.push(this.toExternalTool(name, definition, "plugin", `${entry.source}:${entry.spec}`));
        }
      } catch {
        continue;
      }
    }

    return { plugins, tools };
  }

  async loadLocalTools(loadPaths: string[]): Promise<LoadedExternalTool[]> {
    const tools: LoadedExternalTool[] = [];

    for (const loadPath of loadPaths) {
      const resolvedDir = path.isAbsolute(loadPath) ? loadPath : path.resolve(this.cwd, loadPath);
      const files = await listFilesUnder(resolvedDir);

      for (const file of files) {
        try {
          const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
          const base = path.basename(file, path.extname(file));

          for (const [exportName, value] of Object.entries(mod)) {
            if (!hasExecute(value)) {
              continue;
            }

            const definition = value as PluginToolDefinition;
            const toolName = toToolName(base, exportName);
            tools.push(this.toExternalTool(toolName, definition, "local", file));
          }
        } catch {
          continue;
        }
      }
    }

    return tools;
  }

  private extractPlugin(mod: Record<string, unknown>, fallbackName: string): KigoPlugin | null {
    const direct = mod.default;
    if (isObject(direct) && typeof direct.name === "string") {
      return (direct as unknown) as KigoPlugin;
    }

    for (const value of Object.values(mod)) {
      if (isObject(value) && typeof value.name === "string") {
        return (value as unknown) as KigoPlugin;
      }
    }

    if (isObject(mod) && mod.tools && isObject(mod.tools)) {
      return {
        name: fallbackName,
        tools: mod.tools as Record<string, PluginToolDefinition>,
      };
    }

    return null;
  }

  private toExternalTool(
    name: string,
    definition: PluginToolDefinition,
    source: "plugin" | "local",
    origin: string,
  ): LoadedExternalTool {
    return {
      name,
      description: definition.description,
      parameters: buildToolParameters(definition),
      timeoutMs: definition.timeoutMs,
      source,
      origin,
      execute: async (params: unknown, context: PluginExecutionContext) => {
        let args = params;
        if (definition.schema) {
          args = definition.schema.parse(params);
        }
        const result = await definition.execute(args, context);
        return normalizeOutput(result);
      },
    };
  }
}
