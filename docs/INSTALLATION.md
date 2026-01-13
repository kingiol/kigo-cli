# Kigo CLI 安装指南

Kigo 是一个跨平台的 AI 编程助手 CLI 工具，支持 macOS、Linux 和 Windows。

## 系统要求

- Node.js >= 20.0.0
- npm 或 pnpm 包管理器

## 快速安装

### 方式一：通过 npm 全局安装（推荐）

这是最简单的安装方式，适合所有平台。

```bash
npm install -g @kingiol/kigo-cli
```

或使用 pnpm:

```bash
pnpm add -g @kingiol/kigo-cli
```

安装完成后，运行：

```bash
kigo --version
```

---

## 各平台详细安装指南

### macOS

#### 选项 1: npm 安装（推荐）

```bash
# 1. 安装 Node.js（如果还没有）
brew install node

# 2. 安装 Kigo
npm install -g @kingiol/kigo-cli

# 3. 验证安装
kigo --version
```

#### 选项 2: 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/kigo-node.git
cd kigo-node

# 2. 安装依赖
pnpm install

# 3. 构建项目
pnpm build

# 4. 链接到全局
cd apps/cli
pnpm link --global

# 5. 验证安装
kigo --version
```

#### 选项 3: 下载预编译包（未来支持）

```bash
# 下载适用于 macOS 的包
curl -L https://github.com/your-org/kigo-node/releases/latest/download/kigo-darwin-arm64.tar.gz -o kigo.tar.gz

# 解压
tar -xzf kigo.tar.gz

# 移动到系统路径
sudo mv kigo /usr/local/bin/

# 验证
kigo --version
```

---

### Linux

#### 选项 1: npm 安装（推荐）

```bash
# 1. 安装 Node.js（Ubuntu/Debian）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 或在 Fedora/RHEL
sudo dnf install nodejs

# 2. 安装构建工具（用于编译原生模块）
sudo apt-get install -y build-essential python3

# 3. 安装 Kigo
npm install -g @kingiol/kigo-cli

# 4. 验证安装
kigo --version
```

#### 选项 2: 从源码构建

```bash
# 1. 安装依赖
sudo apt-get update
sudo apt-get install -y git nodejs npm build-essential python3

# 2. 安装 pnpm
npm install -g pnpm

# 3. 克隆仓库
git clone https://github.com/your-org/kigo-node.git
cd kigo-node

# 4. 安装项目依赖
pnpm install

# 5. 构建
pnpm build

# 6. 链接到全局
cd apps/cli
pnpm link --global

# 7. 验证
kigo --version
```

#### 选项 3: 使用预编译包

```bash
# 下载 Linux x64 版本
wget https://github.com/your-org/kigo-node/releases/latest/download/kigo-linux-x64.tar.gz

# 解压
tar -xzf kigo-linux-x64.tar.gz

# 移动到 PATH
sudo mv kigo /usr/local/bin/

# 赋予执行权限
sudo chmod +x /usr/local/bin/kigo

# 验证
kigo --version
```

---

### Windows

#### 选项 1: npm 安装（推荐）

```powershell
# 1. 安装 Node.js
# 从 https://nodejs.org/ 下载并安装 LTS 版本

# 2. 安装 Windows 构建工具（管理员权限）
npm install --global windows-build-tools

# 或者安装 Visual Studio Build Tools
# 从 https://visualstudio.microsoft.com/downloads/ 下载

# 3. 安装 Kigo
npm install -g @kingiol/kigo-cli

# 4. 验证安装
kigo --version
```

#### 选项 2: 从源码构建

```powershell
# 1. 安装 Git
# 从 https://git-scm.com/download/win 下载安装

# 2. 克隆仓库
git clone https://github.com/your-org/kigo-node.git
cd kigo-node

# 3. 安装 pnpm
npm install -g pnpm

# 4. 安装依赖
pnpm install

# 5. 构建
pnpm build

# 6. 链接到全局
cd apps\cli
pnpm link --global

# 7. 验证
kigo --version
```

#### 选项 3: 使用 Chocolatey（未来支持）

```powershell
choco install kigo
```

---

## 常见问题

### 1. `better-sqlite3` 编译失败

**问题**: 安装时报错 "node-gyp rebuild failed"

**解决方案**:

**macOS**:
```bash
xcode-select --install
```

**Linux**:
```bash
sudo apt-get install build-essential python3
```

**Windows**:
```powershell
npm install --global windows-build-tools
```

### 2. 权限错误（macOS/Linux）

**问题**: "EACCES: permission denied"

**解决方案**:
```bash
# 更改 npm 全局目录的所有权
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 然后重新安装
npm install -g @kingiol/kigo-cli
```

### 3. 命令未找到

**问题**: "kigo: command not found"

**解决方案**:

检查 npm 全局 bin 目录是否在 PATH 中:

```bash
# 查看 npm 全局 bin 路径
npm bin -g

# 添加到 PATH（添加到 ~/.bashrc 或 ~/.zshrc）
export PATH="$(npm bin -g):$PATH"
```

### 4. Node.js 版本过低

**问题**: "Requires Node.js >= 20.0.0"

**解决方案**:

```bash
# 使用 nvm 安装更新版本
nvm install 20
nvm use 20

# 或直接从 nodejs.org 下载安装
```

---

## 卸载

### npm 安装的版本

```bash
npm uninstall -g @kingiol/kigo-cli
```

### 从源码构建的版本

```bash
cd /path/to/kigo-node/apps/cli
pnpm unlink --global
```

---

## 更新

```bash
# npm 安装的版本
npm update -g @kingiol/kigo-cli

# 或重新安装最新版本
npm install -g @kingiol/kigo-cli@latest
```

---

## 验证安装

安装完成后，运行以下命令测试:

```bash
# 查看版本
kigo --version

# 查看帮助
kigo --help

# 运行简单命令
kigo "hello world"
```

---

## 获取帮助

- **文档**: https://github.com/your-org/kigo-node/docs
- **问题反馈**: https://github.com/your-org/kigo-node/issues
- **社区讨论**: https://github.com/your-org/kigo-node/discussions

---

## 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | x64 | ✅ 支持 |
| macOS | arm64 (M1/M2) | ✅ 支持 |
| Linux | x64 | ✅ 支持 |
| Linux | arm64 | ✅ 支持 |
| Windows | x64 | ✅ 支持 |
| Windows | arm64 | ⚠️ 实验性 |

---

## 文档

| 主题 | 链接 |
|---|---|
| 用户如何安装？ | `INSTALLATION.md` |
| 如何发布新版本？ | `RELEASE.md` |
| 技术实现细节？ | `CROSS_PLATFORM_GUIDE.md` |
| Claude 集成？ | `CLAUDE.md` |
| 项目概述？ | `../README.md` |
