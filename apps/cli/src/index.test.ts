import { describe, it, expect } from 'vitest';
import * as config from './config/configSchema.js';

describe('@kingiol/kigo-cli', () => {
    it('should export config schemas', () => {
        expect(config.KigoConfigSchema).toBeDefined();
        expect(config.ModelConfigSchema).toBeDefined();
        expect(config.DEFAULT_CONFIG).toBeDefined();
    });
});
