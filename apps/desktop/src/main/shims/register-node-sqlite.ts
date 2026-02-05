import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// Monkey-patch module loader to redirect node:sqlite to our shim.
const moduleRef = require('module') as typeof import('module');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const shimPath = join(__dirname, 'node-sqlite.js');

const originalLoad = moduleRef.Module._load;
moduleRef.Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'node:sqlite' || request === 'sqlite') {
    return originalLoad.call(this, shimPath, parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
} as typeof moduleRef.Module._load;
