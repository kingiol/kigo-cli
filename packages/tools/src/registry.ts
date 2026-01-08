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

export interface ToolDefinition<T extends z.ZodType> {
  name: string;
  description: string;
  schema: T;
  execute: (params: z.infer<T>) => Promise<string>;
  allowedTools?: string[];
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private allowedTools: Set<string> = new Set();

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

    this.tools.set(definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  has(name: string): boolean {
    return this.tools.has(name);
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
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
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