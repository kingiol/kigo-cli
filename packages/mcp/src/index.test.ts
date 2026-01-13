import { describe, it, expect } from 'vitest';
import * as mcp from './index.js';

describe('@kigo/mcp', () => {
    it('should export client and manager', () => {
        expect(mcp.MCPClient).toBeDefined();
        expect(mcp.MCPManager).toBeDefined();
    });

    it('should export transport classes', () => {
        expect(mcp.StdioTransport).toBeDefined();
        expect(mcp.SSETransport).toBeDefined();
        expect(mcp.HTTPTransport).toBeDefined();
    });
});
