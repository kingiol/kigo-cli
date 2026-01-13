# Installation Guide

Kigo is a cross-platform AI coding assistant CLI tool supporting macOS, Linux, and Windows.

## System Requirements
- **OS**: macOS 11+, Linux, or Windows 10+
- **Node.js**: >= 20.0.0 (only for NPM installation)

## 📦 Installation Methods

### Option 1: NPM (Recommended)
The easiest way to install if you have Node.js.

```bash
npm install -g @kingiol/kigo-cli
# OR
pnpm add -g @kingiol/kigo-cli
```

Verify installation:
```bash
kigo --version
```

### Option 2: Pre-compiled Binaries
Standalone executables that don't require pre-installed Node.js. Download the latest release from [GitHub Releases](https://github.com/your-org/kigo-node/releases).

#### macOS
```bash
# Download (replace URL with latest release)
curl -L https://github.com/your-org/kigo-node/releases/latest/download/kigo-darwin-arm64.tar.gz | tar xz
sudo mv kigo /usr/local/bin/
```

#### Linux
```bash
wget https://github.com/your-org/kigo-node/releases/latest/download/kigo-linux-x64.tar.gz
tar xzf kigo-linux-x64.tar.gz
sudo mv kigo /usr/local/bin/
```

#### Windows
Download the `.zip` file, extract it, and add the folder to your system `PATH`.

### Option 3: Build from Source
```bash
git clone https://github.com/your-org/kigo-node.git
cd kigo-node
pnpm install && pnpm build
cd apps/cli && pnpm link --global
```

## 🖥️ Supported Platforms

| Platform | Architecture | NPM | Binary |
|----------|--------------|-----|--------|
| macOS    | x64, arm64   | ✅  | ✅     |
| Linux    | x64, arm64   | ✅  | ✅     |
| Windows  | x64          | ✅  | ✅     |

## 🔧 Troubleshooting

### `better-sqlite3` build errors (NPM install)
If you see errors about `node-gyp` or `better-sqlite3` during installation:

- **macOS**: Run `xcode-select --install`
- **Linux**: Run `sudo apt-get install build-essential python3`
- **Windows**: Run `npm install --global windows-build-tools`

### Permission Denied (macOS/Linux)
If you get `EACCES` errors:
1. Use a Node version manager like `nvm` (recommended).
2. Or configure npm to use a local prefix:
   ```bash
   mkdir -p ~/.npm-global
   npm config set prefix '~/.npm-global'
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   npm install -g @kingiol/kigo-cli
   ```
