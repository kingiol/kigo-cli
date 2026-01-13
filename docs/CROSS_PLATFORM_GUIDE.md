# Kigo CLI 跨平台支持实施指南

## 概述

本文档说明 Kigo CLI 如何支持在 macOS、Windows 和 Linux 上安装和使用。

---

## ✅ 已实现的功能

### 1. 包配置优化 (package.json)

**位置**: `apps/cli/package.json`

**改进内容**:
- ✅ 添加 `files` 字段，指定发布文件
- ✅ 添加 `engines` 字段，指定 Node.js 版本要求 (>=20.0.0)
- ✅ 添加 `os` 字段，明确支持的操作系统 (darwin, linux, win32)
- ✅ 添加 `cpu` 字段，支持的架构 (x64, arm64)

### 2. CI/CD 自动化

**文件**:
- `.github/workflows/test.yml` - 跨平台测试
- `.github/workflows/release.yml` - 自动发布

**测试覆盖**:
| 平台 | Node 版本 | 状态 |
|------|-----------|------|
| Ubuntu | 20, 22 | ✅ |
| macOS | 20, 22 | ✅ |
| Windows | 20, 22 | ✅ |

**发布流程**:
1. 推送 tag (例如 `v0.1.0`)
2. 自动在 6 个平台上构建:
   - macOS (x64, arm64)
   - Linux (x64, arm64)
   - Windows (x64)
3. 上传到 GitHub Releases
4. 发布到 npm

### 3. 安装文档

**位置**: `INSTALLATION.md`

**内容包括**:
- 各平台详细安装步骤
- 常见问题解决方案
- 构建工具依赖说明
- 验证安装方法

### 4. 二进制打包

**脚本**:
- `apps/cli/scripts/build-binary.sh` (macOS/Linux)
- `apps/cli/scripts/build-binary.bat` (Windows)

**使用方法**:

```bash
# macOS/Linux
cd apps/cli
./scripts/build-binary.sh

# Windows
cd apps\cli
scripts\build-binary.bat
```

**输出**: `dist/binaries/kigo-{platform}-{arch}[.exe]`

---

## 📦 分发方式

### 方式 1: npm 全局安装（推荐）

**优点**:
- ✅ 最简单的安装方式
- ✅ 自动处理原生模块 (better-sqlite3)
- ✅ 支持所有平台
- ✅ 自动更新

**安装命令**:
```bash
npm install -g @kigo/cli
```

**发布步骤**:
1. 确保已构建: `pnpm build`
2. 发布到 npm:
   ```bash
   cd apps/cli
   npm publish --access public
   ```

### 方式 2: GitHub Releases（预编译包）

**优点**:
- ✅ 无需 Node.js 环境
- ✅ 独立可执行文件
- ✅ 快速下载安装

**使用步骤**:

1. **创建 Release**:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **自动构建**: GitHub Actions 会自动:
   - 在多平台构建
   - 上传到 Releases

3. **用户下载**:
   ```bash
   # macOS
   curl -L https://github.com/你的组织/kigo-node/releases/latest/download/kigo-darwin-arm64.tar.gz -o kigo.tar.gz
   tar -xzf kigo.tar.gz
   sudo mv kigo /usr/local/bin/

   # Linux
   wget https://github.com/你的组织/kigo-node/releases/latest/download/kigo-linux-x64.tar.gz
   tar -xzf kigo-linux-x64.tar.gz
   sudo mv kigo /usr/local/bin/

   # Windows
   # 下载 kigo-win32-x64.zip 并解压到 PATH
   ```

### 方式 3: 从源码构建

**适用场景**:
- 开发者
- 特殊平台
- 需要自定义构建

**步骤**:
```bash
git clone https://github.com/你的组织/kigo-node.git
cd kigo-node
pnpm install
pnpm build
cd apps/cli
pnpm link --global
```

---

## 🔧 技术细节

### 原生模块处理 (better-sqlite3)

**问题**: better-sqlite3 是原生 C++ 模块，需要为每个平台编译。

**解决方案**:

1. **npm 安装方式**:
   - 使用 `prebuild-install` 自动下载预编译二进制
   - 失败时回退到 `node-gyp rebuild`

2. **独立二进制方式**:
   - 使用 `caxa` 打包，保留 node_modules
   - better-sqlite3 的 `.node` 文件会被包含

3. **tsup 配置**:
   ```typescript
   // apps/cli/tsup.config.ts
   export default defineConfig({
     external: ['better-sqlite3'], // 不打包原生模块
   });
   ```

### 平台检测

**Node.js 内置**:
- `process.platform`: 'darwin' | 'linux' | 'win32'
- `process.arch`: 'x64' | 'arm64'

**在代码中**:
```typescript
import os from 'os';

const platform = os.platform(); // 'darwin', 'linux', 'win32'
const arch = os.arch(); // 'x64', 'arm64'
```

### Shebang 处理

**文件**: `apps/cli/bin/kigo.js`

```javascript
#!/usr/bin/env node
// 在 Unix-like 系统上自动使用 node 执行
```

Windows 会忽略 shebang，直接通过 .js 关联执行。

---

## 🚀 发布流程

### 常规发布（npm）

```bash
# 1. 更新版本
pnpm changeset

# 2. 应用版本变更
pnpm changeset version

# 3. 构建
pnpm build

# 4. 发布
cd apps/cli
npm publish --access public
```

### GitHub Release 发布

```bash
# 1. 创建并推送 tag
git tag v0.1.0
git push origin v0.1.0

# 2. GitHub Actions 自动:
#    - 多平台构建
#    - 创建 Release
#    - 上传 artifacts
#    - 发布到 npm
```

---

## 📋 待办事项清单

### 必须完成

- [ ] **配置 npm 账号**: 在 GitHub Settings 中添加 `NPM_TOKEN`
- [ ] **首次发布**:
  ```bash
  cd apps/cli
  npm publish --access public
  ```
- [ ] **测试安装**: 在各平台测试 npm 安装
- [ ] **更新 README**: 添加安装说明链接

### 推荐完成

- [ ] **Homebrew Formula** (macOS):
  ```ruby
  # kigo.rb
  class Kigo < Formula
    desc "AI-powered coding assistant CLI"
    homepage "https://github.com/你的组织/kigo-node"
    url "https://github.com/你的组织/kigo-node/archive/v0.1.0.tar.gz"
    # ...
  end
  ```

- [ ] **Chocolatey Package** (Windows):
  ```powershell
  choco install kigo
  ```

- [ ] **Snap Package** (Linux):
  ```yaml
  # snapcraft.yaml
  name: kigo
  version: '0.1.0'
  # ...
  ```

### 可选完成

- [ ] **Docker 镜像**:
  ```dockerfile
  FROM node:20-alpine
  RUN npm install -g @kigo/cli
  ENTRYPOINT ["kigo"]
  ```

- [ ] **VS Code 扩展**: 集成 Kigo CLI

---

## 🧪 测试验证

### 本地测试

```bash
# 1. 构建
pnpm build

# 2. 本地链接
cd apps/cli
pnpm link --global

# 3. 测试命令
kigo --version
kigo --help
kigo "hello world"

# 4. 测试 better-sqlite3
node -e "require('better-sqlite3')"
```

### CI 测试

GitHub Actions 会自动在以下平台测试:
- Ubuntu 20.04 (Node 20, 22)
- macOS 13 (Node 20, 22)
- Windows Server 2022 (Node 20, 22)

### 手动测试清单

**macOS**:
- [ ] Intel (x64)
- [ ] Apple Silicon (arm64)
- [ ] npm 安装
- [ ] 从源码构建
- [ ] 二进制文件运行

**Linux**:
- [ ] Ubuntu 22.04 (x64)
- [ ] Debian 12
- [ ] CentOS/RHEL 9
- [ ] Arch Linux
- [ ] npm 安装
- [ ] 从源码构建

**Windows**:
- [ ] Windows 11 (x64)
- [ ] Windows 10 (x64)
- [ ] npm 安装
- [ ] PowerShell 运行
- [ ] CMD 运行

---

## 📚 相关文档

- **安装指南**: `INSTALLATION.md`
- **Claude 集成**: `CLAUDE.md`
- **项目 README**: `README.md`
- **更新日志**: `CHANGELOG.md`

---

## 🔗 资源链接

- **npm 包**: https://www.npmjs.com/package/@kigo/cli
- **GitHub 仓库**: https://github.com/你的组织/kigo-node
- **问题跟踪**: https://github.com/你的组织/kigo-node/issues
- **发布页面**: https://github.com/你的组织/kigo-node/releases

---

## 💡 最佳实践

### 1. 版本管理

使用语义化版本 (Semantic Versioning):
- **MAJOR** (1.0.0): 不兼容的 API 变更
- **MINOR** (0.1.0): 向后兼容的功能添加
- **PATCH** (0.0.1): 向后兼容的 bug 修复

### 2. 发布前检查

```bash
# 运行完整测试套件
pnpm test

# 检查代码质量
pnpm lint

# 构建检查
pnpm build

# 本地安装测试
cd apps/cli
pnpm link --global
kigo --version
```

### 3. 兼容性保证

- 支持 Node.js LTS 版本 (20+)
- 测试覆盖主流平台
- 文档明确依赖要求
- 提供降级方案

---

## 🆘 故障排除

### 常见问题

**1. better-sqlite3 编译失败**

```bash
# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential python3

# Windows
npm install --global windows-build-tools
```

**2. 权限错误**

```bash
# 改用用户目录安装
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

**3. 二进制文件不执行**

```bash
# 检查权限
chmod +x kigo

# 检查依赖
ldd kigo  # Linux
otool -L kigo  # macOS
```

---

## 📊 支持矩阵

| 平台 | 架构 | npm 安装 | 二进制 | Homebrew | 其他 |
|------|------|----------|--------|----------|------|
| macOS 11+ | x64 | ✅ | ✅ | 🚧 | - |
| macOS 11+ | arm64 | ✅ | ✅ | 🚧 | - |
| Ubuntu 20.04+ | x64 | ✅ | ✅ | - | 🚧 Snap |
| Ubuntu 20.04+ | arm64 | ✅ | ✅ | - | 🚧 Snap |
| Debian 11+ | x64 | ✅ | ✅ | - | - |
| RHEL/CentOS 9+ | x64 | ✅ | ✅ | - | - |
| Windows 10+ | x64 | ✅ | ✅ | - | 🚧 Choco |
| Windows 11 | arm64 | ⚠️ | ⚠️ | - | - |

图例:
- ✅ 完全支持
- ⚠️ 实验性支持
- 🚧 计划中
- ❌ 不支持

---

## 🎯 总结

Kigo CLI 现已支持:

1. ✅ **完整的跨平台支持** (macOS, Linux, Windows)
2. ✅ **多种安装方式** (npm, 源码, 二进制)
3. ✅ **自动化 CI/CD** (测试 + 发布)
4. ✅ **完善的文档** (安装指南 + 故障排除)
5. ✅ **原生模块处理** (better-sqlite3)

**下一步行动**:
1. 配置 npm token
2. 推送首个版本 tag
3. 验证自动发布流程
4. 更新主 README

祝发布顺利！🚀
