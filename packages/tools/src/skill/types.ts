/**
 * Skill types
 */

export interface Skill {
  name: string;
  description: string;
  content: string;
  allowedTools?: string[];
  path: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
}