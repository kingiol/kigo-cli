import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLI_ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(CLI_ROOT, 'release');
const DIST_FILE = path.join(CLI_ROOT, 'dist', 'index.cjs');

// Ensure source exists
if (!fs.existsSync(DIST_FILE)) {
    console.error('Error: dist/index.cjs not found. Run "pnpm build" first.');
    process.exit(1);
}

// Clean and create release dir
if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE_DIR);

// 1. Copy Bundle
console.log('Copying bundled file...');
fs.copyFileSync(DIST_FILE, path.join(RELEASE_DIR, 'koder.js'));

// 2. Create package.json
console.log('Creating minimal package.json...');
// Read version from main package.json
const mainPkg = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'));
// Native dependencies that were externalized in tsup
const nativeDeps = {
    'better-sqlite3': mainPkg.dependencies['better-sqlite3'] || 'latest',
};

const releasePkg = {
    name: 'koder-cli-release',
    version: mainPkg.version,
    description: 'Standalone Koder CLI',
    bin: {
        koder: './koder.js'
    },
    scripts: {
        start: 'node koder.js'
    },
    dependencies: nativeDeps,
    engines: mainPkg.engines
};

fs.writeFileSync(
    path.join(RELEASE_DIR, 'package.json'),
    JSON.stringify(releasePkg, null, 2)
);

// 3. Create README
console.log('Creating README.md...');
const readmeContent = `# Koder CLI Release

## Installation

1. Ensure you have Node.js installed (v${mainPkg.engines?.node || '20+'}).
2. Open a terminal in this directory.
3. Run \`npm install --production\` to install native dependencies.

## Usage

Run the CLI using node:

\`\`\`bash
node koder.js --help
\`\`\`

Or use the npm script:

\`\`\`bash
npm start -- --help
\`\`\`
`;

fs.writeFileSync(path.join(RELEASE_DIR, 'README.md'), readmeContent);

console.log(`
✅ Release created in: ${RELEASE_DIR}
----------------------------------------
To verify:
  cd ${RELEASE_DIR}
  npm install
  node koder.js --help
`);
