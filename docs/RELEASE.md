# 🚀 Kigo CLI 发布快速指南

## 📋 发布前检查清单

### 1. 基础配置（一次性）

- [ ] **配置 npm 账号**
  ```bash
  # 登录 npm
  npm login --registry=https://registry.npmjs.org/

  # 验证登录状态
  npm whoami --registry=https://registry.npmjs.org/
  ```

- [ ] **配置 GitHub Secrets**
  - 前往: Settings → Secrets and variables → Actions
  - 添加 `NPM_TOKEN`:
    1. 在 https://www.npmjs.com/settings/[your-username]/tokens 创建 token
    2. 选择 "Automation" 类型
    3. 复制 token 并添加到 GitHub Secrets

- [ ] **更新仓库信息**
  - 编辑 `../apps/cli/package.json`
  - 替换 `your-org` 为实际的组织名
  - 更新 `author` 字段

---

### 2. 发布前准备

- [ ] **运行完整测试**
  ```bash
  # 在项目根目录
  pnpm install
  pnpm build
  pnpm test
  ```

- [ ] **本地验证 CLI**
  ```bash
  cd ../apps/cli
  pnpm link --global
  kigo --version
  kigo "test prompt"
  pnpm unlink --global
  ```

- [ ] **检查依赖项**
  ```bash
  # 检查是否有过时的依赖
  pnpm outdated

  # 更新依赖（可选）
  pnpm update
  ```

- [ ] **更新版本号**
  ```bash
  # 使用 semver 版本号: MAJOR.MINOR.PATCH
  # 例如: 0.1.0 → 0.1.1 (patch)
  #       0.1.0 → 0.2.0 (minor)
  #       0.1.0 → 1.0.0 (major)

  cd ../apps/cli
  npm version patch  # 或 minor, major
  ```

---

## 📦 发布方式

### 方式 A: 通过 npm 手动发布（推荐用于首次发布）

```bash
# 1. 确保在 CLI 目录
cd ../apps/cli

# 2. 构建项目
pnpm build

# 3. 检查将要发布的文件
npm pack --dry-run

# 4. 发布到 npm
npm publish --access public --registry=https://registry.npmjs.org/

# 5. 验证发布
npm view @kingiol/kigo-cli
```

### 方式 B: 通过 GitHub Release 自动发布（推荐）

```bash
# 1. 提交所有更改
git add .
git commit -m "chore: prepare release v0.1.0"

# 2. 创建 tag
git tag v0.1.0

# 3. 推送 tag 到 GitHub
git push origin v0.1.0

# 4. GitHub Actions 会自动:
#    - 在多平台构建和测试
#    - 创建 GitHub Release
#    - 发布到 npm
#    - 上传二进制文件
```

---

## 🧪 发布后验证

### 1. 验证 npm 包

```bash
# 卸载本地链接的版本
pnpm unlink --global @kingiol/kigo-cli

# 从 npm 安装
npm install -g @kingiol/kigo-cli

# 测试
kigo --version
kigo --help
kigo "hello world"
```

### 2. 验证 GitHub Release

- [ ] 访问: https://github.com/your-org/kigo-node/releases
- [ ] 检查是否有新的 release
- [ ] 下载并测试平台特定的二进制文件

### 3. 测试多平台安装

在不同平台测试:

**macOS**:
```bash
npm install -g @kingiol/kigo-cli
kigo --version
```

**Linux (Ubuntu/Docker)**:
```bash
docker run -it --rm node:20-alpine sh
npm install -g @kingiol/kigo-cli
kigo --version
```

**Windows (PowerShell)**:
```powershell
npm install -g @kingiol/kigo-cli
kigo --version
```

---

## 🔄 日常发布流程

### 快速发布（bug 修复）

```bash
# 1. 修复 bug 并测试
pnpm test

# 2. 更新版本（patch）
cd ../apps/cli
npm version patch

# 3. 提交并发布
git add .
git commit -m "fix: your bug fix description"
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

### 功能发布（新特性）

```bash
# 1. 开发新功能
# ... 编码 ...

# 2. 测试
pnpm test

# 3. 更新版本（minor）
cd ../apps/cli
npm version minor

# 4. 更新 CHANGELOG.md
# 记录新功能

# 5. 提交并发布
git add .
git commit -m "feat: your feature description"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

---

## 🚨 常见问题

### 发布失败: "You must be logged in"

```bash
# 重新登录 npm
npm login

# 或使用 token
npm config set //registry.npmjs.org/:_authToken YOUR_NPM_TOKEN
```

### 发布失败: "Package name taken"

如果 `@kingiol/kigo-cli` 已被占用:

1. 更改包名（在 package.json 中）
2. 或请求原作者转让包名

### GitHub Actions 失败

检查:
1. NPM_TOKEN secret 是否正确配置
2. 查看 Actions 日志: https://github.com/your-org/kigo-node/actions
3. 确保所有测试通过

### better-sqlite3 安装失败

确保用户安装了构建工具:

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

---

## 📊 发布版本建议

| 更改类型 | 版本变更 | 示例 |
|---------|---------|------|
| Bug 修复 | PATCH | 0.1.0 → 0.1.1 |
| 新功能（向后兼容） | MINOR | 0.1.0 → 0.2.0 |
| 破坏性更改 | MAJOR | 0.9.0 → 1.0.0 |
| 安全修复 | PATCH | 0.1.0 → 0.1.1 |
| 依赖更新 | PATCH | 0.1.0 → 0.1.1 |
| 文档更新 | 无需发布 | - |

---

## 🎯 首次发布步骤（完整版）

### 步骤 1: 准备环境

```bash
# 1. 确保 Node.js >= 20
node --version

# 2. 登录 npm
npm login --registry=https://registry.npmjs.org/

# 3. 验证
npm whoami
```

### 步骤 2: 最终检查

```bash
# 1. 清理并重新安装
pnpm clean  # 如果有清理脚本
rm -rf node_modules
pnpm install

# 2. 构建
pnpm build

# 3. 运行测试
pnpm test

# 4. Lint 检查
pnpm lint
```

### 步骤 3: 发布

```bash
# 1. 进入 CLI 目录
cd ../apps/cli

# 2. 干运行（查看将要发布的内容）
npm publish --dry-run

# 3. 实际发布
npm publish --access public

# 4. 验证
npm view @kingiol/kigo-cli
```

### 步骤 4: 创建 GitHub Release

```bash
# 1. 提交
git add .
git commit -m "chore: release v0.1.0"

# 2. 打 tag
git tag -a v0.1.0 -m "Release v0.1.0"

# 3. 推送
git push origin main
git push origin v0.1.0
```

### 步骤 5: 验证

```bash
# 1. 卸载本地版本
npm uninstall -g @kingiol/kigo-cli

# 2. 从 npm 安装
npm install -g @kingiol/kigo-cli

# 3. 测试
kigo --version
kigo "hello from npm"
```

---

## 📝 自动化脚本

创建 `scripts/publish.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 开始发布流程..."

# 1. 测试
echo "📋 运行测试..."
pnpm test

# 2. 构建
echo "🔨 构建项目..."
pnpm build

# 3. 版本检查
VERSION=$(node -p "require('../apps/cli/package.json').version")
echo "📦 当前版本: v$VERSION"

read -p "确认发布 v$VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 取消发布"
    exit 1
fi

# 4. 发布到 npm
echo "📤 发布到 npm..."
cd ../apps/cli
npm publish --access public
cd ../..

# 5. 创建 git tag
echo "🏷️  创建 git tag..."
git tag "v$VERSION"

# 6. 推送
echo "⬆️  推送到 GitHub..."
git push origin main
git push origin "v$VERSION"

echo "✅ 发布完成！"
echo "🔗 查看: https://www.npmjs.com/package/@kingiol/kigo-cli"
```

使用方法:
```bash
chmod +x scripts/publish.sh
./scripts/publish.sh
```

---

## 🔗 相关资源

- **npm 文档**: https://docs.npmjs.com/cli/v9/commands/npm-publish
- **GitHub Actions**: https://docs.github.com/en/actions
- **Semantic Versioning**: https://semver.org/
- **npm token 管理**: https://docs.npmjs.com/about-access-tokens

---

## ✅ 检查清单总结

在发布前，确保:

- [ ] ✅ 所有测试通过
- [ ] ✅ 文档已更新
- [ ] ✅ CHANGELOG 已更新
- [ ] ✅ 版本号已更新
- [ ] ✅ package.json 信息完整
- [ ] ✅ npm 账号已登录
- [ ] ✅ GitHub Secrets 已配置
- [ ] ✅ 本地测试 CLI 功能正常
- [ ] ✅ 构建成功无错误

**祝发布顺利！🎉**
