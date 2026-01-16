import { describe, it, expect } from 'vitest';
import * as core from './index.js';
import { BaseProvider } from './models/BaseProvider.js';

describe('@kigo/core', () => {
    it('should export agent classes', () => {
        expect(core.Agent).toBeDefined();
        expect(core.AgentScheduler).toBeDefined();
        expect(core.SubAgentManager).toBeDefined();
    });

    it('should export provider classes', () => {
        expect(core.OpenAIProvider).toBeDefined();
        expect(core.ProviderFactory).toBeDefined();
    });

    it('should run a sub-agent task', async () => {
        class MockProvider extends BaseProvider {
            async *chat(): AsyncIterable<any> {
                yield { delta: { content: 'hello' }, finish_reason: 'stop' };
            }
            async chatNonStream(): Promise<any> {
                return { content: 'hello', finishReason: 'stop' };
            }
        }

        const manager = new core.SubAgentManager({
            tools: [],
            defaultProvider: new MockProvider(),
            defaultSystemPrompt: 'You are a sub-agent.',
        });

        const result = await manager.runSubAgent({ task: 'test' });
        expect(result.output).toContain('hello');
    });
});
