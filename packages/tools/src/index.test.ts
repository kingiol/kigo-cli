import { describe, it, expect } from 'vitest';
import * as tools from './index.js';

describe('@kigo/tools', () => {
    it('should export registry', () => {
        expect(tools.registry).toBeDefined();
        expect(tools.ToolRegistry).toBeDefined();
    });

    it('should register standard tools', () => {
        // Force registration by importing (already done by import * as tools)
        expect(tools.registry.get('read_file')).toBeDefined();
        expect(tools.registry.get('write_file')).toBeDefined();
        expect(tools.registry.get('list_directory')).toBeDefined();
        expect(tools.registry.get('glob_search')).toBeDefined();
        expect(tools.registry.get('answer_questions')).toBeDefined();
        expect(tools.registry.get('ask_user_question')).toBeDefined();
    });

    it('should export schemas', () => {
        expect(tools.readFileSchema).toBeDefined();
        expect(tools.writeFileSchema).toBeDefined();
        expect(tools.listDirectorySchema).toBeDefined();
        expect(tools.globSearchSchema).toBeDefined();
    });
});
