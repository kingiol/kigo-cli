@echo off
REM 跨平台二进制打包脚本 (Windows 版本)
REM 使用 caxa 创建独立可执行文件

setlocal enabledelayedexpansion

echo 🚀 开始构建跨平台二进制文件...

REM 进入 CLI 目录
cd /d "%~dp0\.."

REM 确保已构建
echo 📦 构建项目...
call pnpm build

REM 检查 caxa 是否安装
where caxa >nul 2>&1
if %errorlevel% neq 0 (
    echo 📥 安装 caxa...
    call npm install -g caxa
)

REM 创建输出目录
if not exist "dist\binaries" mkdir "dist\binaries"

REM 获取版本号
for /f "tokens=*" %%i in ('node -p "require('./package.json').version"') do set VERSION=%%i

REM 获取当前平台信息
for /f "tokens=*" %%i in ('node -p "process.platform"') do set PLATFORM=%%i
for /f "tokens=*" %%i in ('node -p "process.arch"') do set ARCH=%%i

echo 🔧 当前平台: %PLATFORM%-%ARCH%
echo 📌 版本: v%VERSION%

set OUTPUT_NAME=kigo-%PLATFORM%-%ARCH%.exe
set OUTPUT_PATH=dist\binaries\%OUTPUT_NAME%

echo 🔨 构建 %OUTPUT_NAME%...

REM 使用 caxa 打包
call npx caxa ^
    --input . ^
    --output "%OUTPUT_PATH%" ^
    --exclude "node_modules/{@types,typescript,tsup,vitest,eslint}/**" ^
    --exclude "src/**" ^
    --exclude "tests/**" ^
    --exclude "*.md" ^
    --exclude ".git/**" ^
    -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/kigo.js"

if %errorlevel% equ 0 (
    echo ✅ 完成: %OUTPUT_PATH%
    echo 🎉 构建完成！
    echo 输出目录: dist\binaries\
    dir dist\binaries\
) else (
    echo ❌ 构建失败
    exit /b 1
)

endlocal
