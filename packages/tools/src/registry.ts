/**
 * Tool registry for managing and executing tools
 */

import { z } from 'zod';
import { SecurityGuard } from './security.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

export interface Tool {
  name: string;
  description: string;
  parameters: any; // JSON schema
  execute: (params: any) => Promise<string>;
}

export type ToolSource = 'builtin' | 'local' | 'plugin';

export interface ToolCatalogItem {
  name: string;
  description: string;
  parameters: any;
  source: ToolSource;
  origin?: string;
}

export interface ToolDefinition<T extends z.ZodType> {
  name: string;
  description: string;
  schema: T;
  execute: (params: z.infer<T>) => Promise<string>;
  allowedTools?: string[];
}

export class ToolRegistry {
  private tools: Map<string, { tool: Tool; source: ToolSource; origin?: string; priority: number }> = new Map();
  private allowedTools: Set<string> = new Set();

  private sourcePriority(source: ToolSource): number {
    switch (source) {
      case 'plugin':
        return 3;
      case 'local':
        return 2;
      default:
        return 1;
    }
  }

  private upsert(tool: Tool, source: ToolSource, origin?: string): void {
    const incomingPriority = this.sourcePriority(source);
    const current = this.tools.get(tool.name);
    if (current && current.priority > incomingPriority) {
      return;
    }
    this.tools.set(tool.name, {
      tool,
      source,
      origin,
      priority: incomingPriority,
    });
  }

  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    const tool: Tool = {
      name: definition.name,
      description: definition.description,
      parameters: zodToJsonSchema(definition.schema),
      execute: async (params: any) => {
        // Validate parameters
        const validated = definition.schema.parse(params);

        // Execute with security filtering
        const result = await definition.execute(validated);

        // Filter sensitive output
        return SecurityGuard.filterSensitiveOutput(result);
      },
    };

    this.upsert(tool, 'builtin');
  }

  registerExternal(tool: Tool, source: ToolSource, origin?: string): void {
    this.upsert(tool, source, origin);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values()).map((entry) => entry.tool);
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getCatalog(): ToolCatalogItem[] {
    return Array.from(this.tools.values()).map((entry) => ({
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters,
      source: entry.source,
      origin: entry.origin,
    }));
  }

  clearBySource(sources: ToolSource[]): void {
    const sourceSet = new Set(sources);
    for (const [name, entry] of this.tools.entries()) {
      if (sourceSet.has(entry.source)) {
        this.tools.delete(name);
      }
    }
  }

  setAllowedTools(tools: string[]): void {
    this.allowedTools = new Set(tools);
  }

  isToolAllowed(name: string): boolean {
    if (this.allowedTools.size === 0) {
      return true;
    }
    return this.allowedTools.has(name);
  }

  clearAllowedTools(): void {
    this.allowedTools.clear();
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  clear(): void {
    this.tools.clear();
    this.allowedTools.clear();
  }

  getToolSchemas(): Array<{ name: string; description: string; parameters: any }> {
    return Array.from(this.tools.values()).map(entry => ({
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters,
    }));
  }
}

// Global registry instance
export const registry = new ToolRegistry();

// Decorator factory for registering tools
export function tool<T extends z.ZodType>(definition: ToolDefinition<T>) {
  // Allow direct registration if execute is provided
  if (typeof definition.execute === 'function') {
    registry.register(definition);
  }

  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    registry.register({
      ...definition,
      execute: descriptor.value,
    });
    return descriptor;
  };
}

// Helper to create a tool from a function
export function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  execute: (params: z.infer<T>) => Promise<string>
): Tool {
  const tool: Tool = {
    name,
    description,
    parameters: zodToJsonSchema(schema),
    execute: async (params: any) => {
      const validated = schema.parse(params);
      const result = await execute(validated);
      return SecurityGuard.filterSensitiveOutput(result);
    },
  };

  return tool;
}
