/**
 * Skill loader for discovering and loading skills
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import matter from 'gray-matter';
import type { Skill, SkillMetadata } from './types.js';

export class SkillLoader {
  private cache = new Map<string, Skill>();
  private projectDir: string;
  private userDir: string;

  constructor(projectDir?: string) {
    this.projectDir = projectDir || path.join(process.cwd(), '.kigo', 'skills');
    this.userDir = path.join(os.homedir(), '.kigo', 'skills');
  }

  async discoverSkills(): Promise<SkillMetadata[]> {
    const skills: SkillMetadata[] = [];

    // Load from project directory (higher priority)
    const projectSkills = await this.loadSkillsFromDir(this.projectDir);
    skills.push(...projectSkills);

    // Load from user directory
    const userSkills = await this.loadSkillsFromDir(this.userDir);
    for (const skill of userSkills) {
      if (!skills.find(s => s.name === skill.name)) {
        skills.push(skill);
      }
    }

    return skills;
  }

  private async loadSkillsFromDir(dir: string): Promise<SkillMetadata[]> {
    const skills: SkillMetadata[] = [];

    try {
      await this.findSkillFiles(dir, skills);
    } catch {
      // Directory doesn't exist
    }

    return skills;
  }

  private async findSkillFiles(dir: string, skills: SkillMetadata[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(dir, entry.name);
          await this.findSkillFiles(subDir, skills);
        } else if (entry.name === 'SKILL.md') {
          const skillPath = path.join(dir, entry.name);
          const skill = await this.loadSkill(skillPath);
          if (skill) {
            // Only add metadata, not full content
            skills.push({ name: skill.name, description: skill.description });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  async loadSkill(skillPath: string): Promise<Skill | null> {
    if (this.cache.has(skillPath)) {
      return this.cache.get(skillPath)!;
    }

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const parsed = matter(content);

      const frontmatter = parsed.data as any;
      const body = parsed.content;

      const skill: Skill = {
        name: frontmatter.name || path.basename(path.dirname(skillPath)),
        description: frontmatter.description || '',
        content: body,
        allowedTools: frontmatter['allowed-tools'] as string[] | undefined,
        path: skillPath,
      };

      // Validate name
      if (!skill.name || !/^[a-z0-9-]+$/.test(skill.name)) {
        return null;
      }

      this.cache.set(skillPath, skill);
      return skill;
    } catch {
      return null;
    }
  }

  async getSkill(name: string): Promise<Skill | null> {
    // Search in project directory first
    const projectSkill = await this.findSkillInDir(this.projectDir, name);
    if (projectSkill) {
      return projectSkill;
    }

    // Search in user directory
    return await this.findSkillInDir(this.userDir, name);
  }

  private async findSkillInDir(dir: string, name: string): Promise<Skill | null> {
    try {
      await this.findSkillByName(dir, name);
    } catch {
      // Directory doesn't exist
    }

    for (const [_cachedPath, skill] of this.cache) {
      if (skill.name === name) {
        return skill;
      }
    }

    return null;
  }

  private async findSkillByName(dir: string, name: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(dir, entry.name);
          await this.findSkillByName(subDir, name);
        } else if (entry.name === 'SKILL.md') {
          const skillPath = path.join(dir, entry.name);
          const skill = await this.loadSkill(skillPath);
          if (skill?.name === name) {
            return;
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  getSkillsMetadataPrompt(): string {
    const skills = Array.from(this.cache.values());
    if (skills.length === 0) {
      return 'No skills available.';
    }

    return skills
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
  }

  getAllowedTools(skillName: string): string[] | undefined {
    for (const skill of this.cache.values()) {
      if (skill.name === skillName) {
        return skill.allowedTools;
      }
    }
    return undefined;
  }

  clearCache(): void {
    this.cache.clear();
  }
}