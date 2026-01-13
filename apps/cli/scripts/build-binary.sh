#!/usr/bin/env bash

# 跨平台二进制打包脚本
# 使用 caxa 创建独立可执行文件

set -e

echo "🚀 开始构建跨平台二进制文件..."

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 进入 CLI 目录
cd "$(dirname "$0")/.."

# 确保已构建
echo -e "${BLUE}📦 构建项目...${NC}"
pnpm build

# 安装 caxa（如果还没有）
if ! command -v caxa &> /dev/null; then
    echo -e "${BLUE}📥 安装 caxa...${NC}"
    npm install -g caxa
fi

# 创建输出目录
mkdir -p dist/binaries

# 获取版本号
VERSION=$(node -p "require('./package.json').version")

# 获取当前平台信息
PLATFORM=$(node -p "process.platform")
ARCH=$(node -p "process.arch")

echo -e "${BLUE}🔧 当前平台: ${PLATFORM}-${ARCH}${NC}"
echo -e "${BLUE}📌 版本: v${VERSION}${NC}"

# 构建函数
build_binary() {
    local platform=$1
    local arch=$2
    local extension=$3

    local output_name="kigo-${platform}-${arch}${extension}"
    local output_path="dist/binaries/${output_name}"

    echo -e "${BLUE}🔨 构建 ${output_name}...${NC}"

    # 使用 caxa 打包
    npx caxa \
        --input . \
        --output "${output_path}" \
        --exclude "node_modules/{@types,typescript,tsup,vitest,eslint}/**" \
        --exclude "src/**" \
        --exclude "tests/**" \
        --exclude "*.md" \
        --exclude ".git/**" \
        -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/kigo.js"

    echo -e "${GREEN}✅ 完成: ${output_path}${NC}"
}

# 根据当前平台构建
case "$PLATFORM" in
    darwin)
        build_binary "darwin" "$ARCH" ""
        ;;
    linux)
        build_binary "linux" "$ARCH" ""
        ;;
    win32)
        build_binary "win32" "$ARCH" ".exe"
        ;;
    *)
        echo "不支持的平台: $PLATFORM"
        exit 1
        ;;
esac

echo -e "${GREEN}🎉 构建完成！${NC}"
echo -e "${BLUE}输出目录: dist/binaries/${NC}"
ls -lh dist/binaries/
