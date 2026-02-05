import { MCPServerConfigSchema, type MCPServerConfig } from '@kigo/config';
import { loadConfig, saveConfig } from './config.js';

export async function listMcpServers(): Promise<MCPServerConfig[]> {
  const { config } = await loadConfig();
  return config.mcpServers ?? [];
}

export async function addOrUpdateMcpServer(server: MCPServerConfig): Promise<{ servers: MCPServerConfig[]; path: string }>
{
  const validated = MCPServerConfigSchema.parse(server);
  const { config } = await loadConfig();
  const servers = [...(config.mcpServers ?? [])];
  const existingIndex = servers.findIndex((item) => item.name === validated.name);

  if (existingIndex >= 0) {
    servers[existingIndex] = validated;
  } else {
    servers.push(validated);
  }

  const path = await saveConfig({ ...config, mcpServers: servers });
  return { servers, path };
}

export async function removeMcpServer(name: string): Promise<{ servers: MCPServerConfig[]; path: string }> {
  const { config } = await loadConfig();
  const servers = (config.mcpServers ?? []).filter((server) => server.name !== name);
  const path = await saveConfig({ ...config, mcpServers: servers });
  return { servers, path };
}

export async function testMcpServer(server: MCPServerConfig): Promise<{ ok: boolean; message: string }> {
  const validated = MCPServerConfigSchema.parse(server);

  if (validated.transportType === 'stdio') {
    return { ok: false, message: 'stdio test not implemented. Validate command manually.' };
  }

  if (!validated.url) {
    return { ok: false, message: 'Missing URL for http/sse transport.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(validated.url, {
      method: 'GET',
      headers: validated.headers,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { ok: false, message: `Server responded with ${response.status}` };
    }
    return { ok: true, message: 'Connection OK' };
  } catch (error) {
    return { ok: false, message: `Connection failed: ${error}` };
  }
}
