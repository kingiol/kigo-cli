import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { DEFAULT_CONFIG, KigoConfigSchema, type KigoConfig } from './configSchema.js';

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.kigo', 'config.yaml');

export function getConfigPath(configPath?: string): string {
  return configPath ?? DEFAULT_CONFIG_PATH;
}

export async function loadConfig(configPath?: string): Promise<{ config: KigoConfig; path: string }> {
  const resolvedPath = getConfigPath(configPath);

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const parsed = yaml.load(content) ?? {};
    const config = KigoConfigSchema.parse(parsed);
    return { config, path: resolvedPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to load config from ${resolvedPath}: ${error}`);
    }
    return { config: DEFAULT_CONFIG, path: resolvedPath };
  }
}

export async function saveConfig(config: KigoConfig, configPath?: string): Promise<string> {
  const resolvedPath = getConfigPath(configPath);
  const validated = KigoConfigSchema.parse(config);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });
  const content = yaml.dump(validated, { indent: 2, lineWidth: 120 });
  await fs.writeFile(resolvedPath, content, 'utf-8');

  return resolvedPath;
}
