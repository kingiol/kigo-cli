import os from 'node:os';
import path from 'node:path';
import { SkillLoader } from '@kigo/tools';
import { loadConfig } from './config.js';

function expandTilde(value: string): string {
  if (!value.startsWith('~')) return value;
  return path.join(os.homedir(), value.slice(1));
}

function createLoader(projectDir?: string, userDir?: string): SkillLoader {
  const resolvedProject = projectDir ? expandTilde(projectDir) : undefined;
  const resolvedUser = userDir ? expandTilde(userDir) : undefined;
  return new SkillLoader(resolvedProject, resolvedUser);
}

export async function listSkills(): Promise<Array<{ name: string; description: string }>> {
  const { config } = await loadConfig();
  if (!config.skills?.enabled) return [];

  const loader = createLoader(config.skills.projectSkillsDir, config.skills.userSkillsDir);
  return loader.discoverSkills();
}

export async function getSkill(name: string): Promise<{
  name: string;
  description: string;
  content: string;
  allowedTools?: string[];
  path: string;
} | null> {
  const { config } = await loadConfig();
  if (!config.skills?.enabled) return null;

  const loader = createLoader(config.skills.projectSkillsDir, config.skills.userSkillsDir);
  const skill = await loader.getSkill(name);
  if (!skill) return null;

  return {
    name: skill.name,
    description: skill.description,
    content: skill.content,
    allowedTools: skill.allowedTools,
    path: skill.path
  };
}
