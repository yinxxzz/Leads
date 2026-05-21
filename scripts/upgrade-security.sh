#!/bin/bash
# upgrade-security.sh
# Next.js 安全升级脚本 - 修复 CVE-2025-55182
# 使用方法: ./upgrade-security.sh

set -e  # 遇到错误立即退出

# ============================================================
# 配置
# ============================================================
PORT=8000
UPGRADE_VERSION="14"  # 使用 next@14 获取最新 14.x 稳定版

# ============================================================
# 颜色输出
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============================================================
# 操作系统检测
# ============================================================
detect_os() {
    OS_TYPE=$(uname -s)
    case "$OS_TYPE" in
        Darwin*)
            OS="macos"
            ;;
        Linux*)
            OS="linux"
            ;;
        *)
            log_error "不支持的操作系统: $OS_TYPE"
            exit 1
            ;;
    esac
    log_info "检测到操作系统: $OS"
}

# ============================================================
# 获取占用端口的进程 PID
# ============================================================
get_port_pid() {
    local port=$1
    local pid=""
    
    if [ "$OS" = "macos" ]; then
        # macOS: 使用 lsof
        pid=$(lsof -ti:$port 2>/dev/null | head -1 || echo "")
    else
        # Linux: 优先使用 ss，备用 netstat
        if command -v ss &> /dev/null; then
            # ss 输出格式: users:(("node",pid=12345,fd=18))
            pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || echo "")
        elif command -v netstat &> /dev/null; then
            # netstat 输出格式: tcp 0 0 :::8000 :::* LISTEN 12345/node
            pid=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | head -1 || echo "")
        else
            log_warning "未找到 ss 或 netstat 命令，无法检测端口占用"
            pid=""
        fi
    fi
    
    echo "$pid"
}

# ============================================================
# 获取进程的工作目录
# ============================================================
get_process_cwd() {
    local pid=$1
    local cwd=""
    
    if [ "$OS" = "macos" ]; then
        # macOS: 使用 lsof -d cwd
        cwd=$(lsof -a -p $pid -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//' || echo "")
    else
        # Linux: 读取 /proc/PID/cwd 符号链接
        if [ -L "/proc/$pid/cwd" ]; then
            cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || echo "")
        fi
    fi
    
    echo "$cwd"
}

# ============================================================
# 检查进程是否是 Next.js devServer
# ============================================================
is_nextjs_process() {
    local pid=$1
    local cmd=$(ps -p $pid -o command= 2>/dev/null || echo "")
    
    if echo "$cmd" | grep -qE "(next dev|npm.*dev|node.*next)"; then
        return 0  # true
    else
        return 1  # false
    fi
}

# ============================================================
# 停止进程
# ============================================================
stop_process() {
    local pid=$1
    local timeout=10
    
    log_info "正在停止进程 (PID: $pid)..."
    
    # 发送 TERM 信号
    kill -TERM $pid 2>/dev/null || true
    
    # 等待进程退出
    while [ $timeout -gt 0 ] && kill -0 $pid 2>/dev/null; do
        sleep 1
        timeout=$((timeout - 1))
    done
    
    # 如果进程仍在运行，强制终止
    if kill -0 $pid 2>/dev/null; then
        log_warning "进程未响应 TERM 信号，强制终止..."
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
    
    if kill -0 $pid 2>/dev/null; then
        log_error "无法终止进程 $pid"
        return 1
    fi
    
    log_success "进程已停止"
    return 0
}

# ============================================================
# 主逻辑
# ============================================================
main() {
    echo ""
    echo "========================================"
    echo "  Next.js 安全升级脚本"
    echo "  修复 CVE-2025-55182"
    echo "========================================"
    echo ""
    
    # 1. 检测操作系统
    detect_os
    
    # 获取脚本所在目录
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    log_info "脚本所在目录: $SCRIPT_DIR"
    
    # 2. 检测 devServer 状态（决定使用哪个项目目录）
    log_info "检查端口 $PORT 的 devServer 状态..."
    
    DEV_PID=$(get_port_pid $PORT)
    RESTART_SERVER=false
    
    if [ -n "$DEV_PID" ]; then
        log_info "检测到端口 $PORT 有进程运行 (PID: $DEV_PID)"
        
        # 获取进程工作目录
        PROCESS_CWD=$(get_process_cwd $DEV_PID)
        
        if [ -n "$PROCESS_CWD" ]; then
            log_info "进程工作目录: $PROCESS_CWD"
            
            # 检查进程目录是否是 Next.js 项目
            if [ -f "$PROCESS_CWD/package.json" ] && grep -q '"next":' "$PROCESS_CWD/package.json" 2>/dev/null; then
                # 使用进程工作目录作为项目目录
                SCRIPT_DIR="$PROCESS_CWD"
                cd "$SCRIPT_DIR"
                log_info "使用进程工作目录: $SCRIPT_DIR"
            else
                log_error "端口 $PORT 的进程工作目录不是 Next.js 项目"
                exit 1
            fi
        else
            log_error "无法获取端口 $PORT 进程的工作目录"
            exit 1
        fi
        
        # 检查是否是 Next.js 进程
        if is_nextjs_process $DEV_PID; then
            log_info "确认是 Next.js devServer 进程"
            
            # 停止进程
            if stop_process $DEV_PID; then
                RESTART_SERVER=true
            fi
        else
            log_warning "端口 $PORT 被非 Next.js 进程占用，跳过停止"
        fi
    else
        log_info "端口 $PORT 未被占用，检查脚本所在目录..."
        
        # 检查脚本所在目录是否是 Next.js 项目
        if [ ! -f "$SCRIPT_DIR/package.json" ] || ! grep -q '"next":' "$SCRIPT_DIR/package.json" 2>/dev/null; then
            log_error "脚本所在目录不是 Next.js 项目: $SCRIPT_DIR"
            log_error "请在 Next.js 项目目录中放置此脚本，或启动 devServer 后再执行"
            exit 1
        fi
        
        cd "$SCRIPT_DIR"
        log_info "使用脚本所在目录: $SCRIPT_DIR"
    fi
    
    # 3. 备份 package.json
    log_info "备份 package.json..."
    cp package.json package.json.backup
    log_success "已备份到 package.json.backup"
    
    # 获取当前版本
    CURRENT_NEXT_VERSION=$(node -p "require('./package.json').dependencies.next" 2>/dev/null || echo "未知")
    log_info "当前 Next.js 版本: $CURRENT_NEXT_VERSION"
    
    # 5. 升级依赖
    log_info "升级 Next.js 到 $UPGRADE_VERSION..."
    
    if ! npm install next@$UPGRADE_VERSION eslint-config-next@$UPGRADE_VERSION --legacy-peer-deps; then
        log_error "依赖升级失败，恢复备份..."
        mv package.json.backup package.json
        exit 1
    fi
    
    log_success "依赖升级成功"
    
    # 6. 清理缓存
    log_info "清理构建缓存..."
    rm -rf .next node_modules/.cache 2>/dev/null || true
    log_success "缓存已清理"
    
    # 7. 重新安装依赖
    log_info "重新安装依赖以更新 lockfile..."
    
    if ! npm install --legacy-peer-deps; then
        log_error "依赖安装失败"
        exit 1
    fi
    
    log_success "依赖安装完成"
    
    # 8. Git 提交和推送
    log_info "提交变更到 Git..."
    
    # 检查是否有变更
    if git diff --quiet package.json package-lock.json 2>/dev/null; then
        log_warning "没有检测到变更，跳过 Git 提交"
    else
        # 添加变更
        git add package.json package-lock.json
        
        # 获取新版本
        NEW_NEXT_VERSION=$(node -p "require('./package.json').dependencies.next" 2>/dev/null || echo "未知")
        
        # 生成提交信息
        COMMIT_MSG="[Security] 升级 Next.js 到 $NEW_NEXT_VERSION

- 修复 React Server Components 安全漏洞 (CVE-2025-55182)
- 升级 Next.js: $CURRENT_NEXT_VERSION -> $NEW_NEXT_VERSION
- 升级时间: $(date '+%Y-%m-%d %H:%M:%S')

参考: https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components"
        
        if git commit -m "$COMMIT_MSG"; then
            log_success "Git 提交成功"
            
            # 推送到远端
            log_info "推送到远端仓库..."
            
            CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
            
            if git push origin "$CURRENT_BRANCH"; then
                log_success "已推送到远端分支: $CURRENT_BRANCH"
            else
                log_warning "推送失败，请手动执行: git push origin $CURRENT_BRANCH"
            fi
        else
            log_warning "Git 提交失败，请手动提交"
        fi
    fi
    
    # 9. 验证版本
    log_info "验证升级后的版本..."
    npm list next react react-dom 2>/dev/null | head -5 || true
    
    # 10. 重启 devServer
    if [ "$RESTART_SERVER" = true ]; then
        log_info "重启 devServer..."
        
        # 使用 nohup 在后台启动
        nohup npm run dev > dev-server.log 2>&1 &
        NEW_PID=$!
        
        # 等待服务启动
        log_info "等待服务启动... (PID: $NEW_PID)"
        sleep 3
        
        # 检查进程是否还在运行
        if kill -0 $NEW_PID 2>/dev/null; then
            log_success "devServer 已重启 (PID: $NEW_PID)"
            log_info "日志文件: $SCRIPT_DIR/dev-server.log"
            log_info "访问地址: http://localhost:$PORT"
        else
            log_error "devServer 启动失败，请查看日志: $SCRIPT_DIR/dev-server.log"
            exit 1
        fi
    else
        log_info "devServer 未自动重启（之前未运行）"
        log_info "如需启动，请运行: npm run dev"
    fi
    
    # 11. 清理备份文件
    rm -f package.json.backup
    
    # 12. 输出摘要
    NEW_NEXT_VERSION=$(node -p "require('./package.json').dependencies.next" 2>/dev/null || echo "未知")
    
    echo ""
    echo "========================================"
    log_success "升级完成！"
    echo "========================================"
    echo ""
    echo "📊 升级摘要:"
    echo "  项目: $(basename "$SCRIPT_DIR")"
    echo "  Next.js: $CURRENT_NEXT_VERSION -> $NEW_NEXT_VERSION"
    echo "  状态: 已提交并推送到远端"
    if [ "$RESTART_SERVER" = true ]; then
        echo "  devServer: 已重启 (PID: $NEW_PID)"
        echo "  访问地址: http://localhost:$PORT"
    fi
    echo ""
}

# 执行主逻辑
main "$@"
