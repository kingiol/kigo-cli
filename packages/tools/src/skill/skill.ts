/**
 * Skill tool
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SkillLoader } from './loader.js';

const skillLoader = new SkillLoader();

// Initialize skills on import
skillLoader.discoverSkills().catch(() => {
  // Ignore errors during initialization
});

tool({
  name: 'get_skill',
  description: 'Load a skill by name. Skills provide specialized knowledge for specific tasks.',
  schema: z.object({
    name: z.string().describe('The name of the skill to load'),
  }),
  execute: async ({ name }) => {
    const skill = await skillLoader.getSkill(name);
    if (!skill) {
      return `Skill not found: ${name}`;
    }
    return skill.content;
  },
});

// Export loader for use in other modules
export { SkillLoader } from './loader.js';
export * from './types.js';