import { describe, it, expect } from 'vitest';
import * as auth from './index.js';

describe('@kigo/auth', () => {
    it('should export auth utilities', () => {
        expect(auth.generatePKCE).toBeDefined();
        expect(auth.TokenStorage).toBeDefined();
    });

    it('should export providers', () => {
        expect(auth.OAuthProvider).toBeDefined();
        expect(auth.GoogleProvider).toBeDefined();
    });
});
