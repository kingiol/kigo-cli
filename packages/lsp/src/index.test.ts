import { describe, it, expect } from 'vitest';
import * as lsp from './index.js';

describe('@kigo/lsp', () => {
  it('should export the server entrypoint', () => {
    expect(lsp.startLspServer).toBeDefined();
  });
});
