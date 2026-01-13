import { describe, it, expect } from 'vitest';
import * as core from './index.js';

describe('@kigo/core', () => {
    it('should export agent classes', () => {
        expect(core.Agent).toBeDefined();
        expect(core.AgentScheduler).toBeDefined();
    });

    it('should export provider classes', () => {
        expect(core.OpenAIProvider).toBeDefined();
        expect(core.ProviderFactory).toBeDefined();
    });
});
