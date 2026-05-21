#!/bin/bash
# upgrade-security.test.sh
# 测试 upgrade-security.sh 的项目检测逻辑
# 使用方法: ./upgrade-security.test.sh

set -e

# ============================================================
# 颜色输出
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_test() { echo -e "${YELLOW}🧪 $1${NC}"; }

# ============================================================
# 测试配置
# ============================================================
TEST_PORT=18000  # 使用不常用的端口避免冲突
TEST_DIR=$(mktemp -d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
    log_info "清理测试环境..."
    # 停止测试服务器
    if [ -n "$TEST_SERVER_PID" ] && kill -0 $TEST_SERVER_PID 2>/dev/null; then
        kill $TEST_SERVER_PID 2>/dev/null || true
    fi
    # 清理临时目录
    rm -rf "$TEST_DIR"
    log_info "清理完成"
}

trap cleanup EXIT

# ============================================================
# 模拟函数（从原脚本复制，用于测试）
# ============================================================
detect_os() {
    OS_TYPE=$(uname -s)
    case "$OS_TYPE" in
        Darwin*) OS="macos" ;;
        Linux*) OS="linux" ;;
        *) OS="unknown" ;;
    esac
}

get_port_pid() {
    local port=$1
    local pid=""
    
    if [ "$OS" = "macos" ]; then
        pid=$(lsof -ti:$port 2>/dev/null | head -1 || echo "")
    else
        if command -v ss &> /dev/null; then
            pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || echo "")
        elif command -v netstat &> /dev/null; then
            pid=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | head -1 || echo "")
        fi
    fi
    
    echo "$pid"
}

get_process_cwd() {
    local pid=$1
    local cwd=""
    
    if [ "$OS" = "macos" ]; then
        cwd=$(lsof -a -p $pid -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//' || echo "")
    else
        if [ -L "/proc/$pid/cwd" ]; then
            cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || echo "")
        fi
    fi
    
    echo "$cwd"
}

# ============================================================
# 测试辅助函数
# ============================================================
# 规范化路径（处理 macOS /var -> /private/var 符号链接问题）
normalize_path() {
    local path=$1
    if [ "$OS" = "macos" ]; then
        # macOS 需要处理 /var -> /private/var
        python3 -c "import os; print(os.path.realpath('$path'))" 2>/dev/null || echo "$path"
    else
        readlink -f "$path" 2>/dev/null || echo "$path"
    fi
}

create_nextjs_project() {
    local dir=$1
    mkdir -p "$dir"
    cat > "$dir/package.json" << 'EOF'
{
  "name": "test-nextjs-project",
  "version": "1.0.0",
  "dependencies": {
    "next": "14.2.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
EOF
    log_info "创建 Next.js 项目: $dir"
}

create_non_nextjs_project() {
    local dir=$1
    mkdir -p "$dir"
    cat > "$dir/package.json" << 'EOF'
{
  "name": "test-other-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  }
}
EOF
    log_info "创建非 Next.js 项目: $dir"
}

start_test_server() {
    local dir=$1
    local port=$2
    
    cd "$dir"
    # 使用 Python 的简单 HTTP 服务器模拟端口占用
    if command -v python3 &> /dev/null; then
        python3 -m http.server $port > /dev/null 2>&1 &
    elif command -v python &> /dev/null; then
        python -m SimpleHTTPServer $port > /dev/null 2>&1 &
    else
        log_error "未找到 Python，无法启动测试服务器"
        return 1
    fi
    
    TEST_SERVER_PID=$!
    sleep 1  # 等待服务器启动
    
    if kill -0 $TEST_SERVER_PID 2>/dev/null; then
        log_info "测试服务器启动成功 (PID: $TEST_SERVER_PID, 端口: $port, 目录: $dir)"
        return 0
    else
        log_error "测试服务器启动失败"
        return 1
    fi
}

stop_test_server() {
    if [ -n "$TEST_SERVER_PID" ] && kill -0 $TEST_SERVER_PID 2>/dev/null; then
        kill $TEST_SERVER_PID 2>/dev/null || true
        wait $TEST_SERVER_PID 2>/dev/null || true
        TEST_SERVER_PID=""
        log_info "测试服务器已停止"
    fi
}

# ============================================================
# 测试用例
# ============================================================
test_case_1() {
    log_test "测试用例 1: 端口有服务，进程目录是 Next.js 项目"
    
    local project_dir="$TEST_DIR/nextjs-project-1"
    create_nextjs_project "$project_dir"
    
    # 规范化路径用于比对
    local normalized_project_dir=$(normalize_path "$project_dir")
    
    if ! start_test_server "$project_dir" $TEST_PORT; then
        log_error "FAILED - 无法启动测试服务器"
        return 1
    fi
    
    # 验证端口检测
    local pid=$(get_port_pid $TEST_PORT)
    if [ -z "$pid" ]; then
        log_error "FAILED - 无法检测到端口 $TEST_PORT 的进程"
        stop_test_server
        return 1
    fi
    log_info "检测到进程 PID: $pid"
    
    # 验证工作目录检测
    local cwd=$(get_process_cwd $pid)
    if [ -z "$cwd" ]; then
        log_error "FAILED - 无法获取进程工作目录"
        stop_test_server
        return 1
    fi
    log_info "进程工作目录: $cwd"
    
    # 验证目录匹配（使用规范化路径比对）
    local normalized_cwd=$(normalize_path "$cwd")
    if [ "$normalized_cwd" != "$normalized_project_dir" ]; then
        log_error "FAILED - 工作目录不匹配"
        log_error "  期望: $normalized_project_dir"
        log_error "  实际: $normalized_cwd"
        stop_test_server
        return 1
    fi
    
    # 验证是 Next.js 项目
    if [ -f "$cwd/package.json" ] && grep -q '"next":' "$cwd/package.json" 2>/dev/null; then
        log_success "PASSED - 正确识别为 Next.js 项目"
    else
        log_error "FAILED - 未能识别为 Next.js 项目"
        stop_test_server
        return 1
    fi
    
    stop_test_server
    return 0
}

test_case_2() {
    log_test "测试用例 2: 端口有服务，进程目录不是 Next.js 项目"
    
    local project_dir="$TEST_DIR/express-project"
    create_non_nextjs_project "$project_dir"
    
    if ! start_test_server "$project_dir" $TEST_PORT; then
        log_error "FAILED - 无法启动测试服务器"
        return 1
    fi
    
    # 验证端口检测
    local pid=$(get_port_pid $TEST_PORT)
    if [ -z "$pid" ]; then
        log_error "FAILED - 无法检测到端口 $TEST_PORT 的进程"
        stop_test_server
        return 1
    fi
    
    # 验证工作目录检测
    local cwd=$(get_process_cwd $pid)
    if [ -z "$cwd" ]; then
        log_error "FAILED - 无法获取进程工作目录"
        stop_test_server
        return 1
    fi
    
    # 验证不是 Next.js 项目
    if [ -f "$cwd/package.json" ] && grep -q '"next":' "$cwd/package.json" 2>/dev/null; then
        log_error "FAILED - 错误地识别为 Next.js 项目"
        stop_test_server
        return 1
    else
        log_success "PASSED - 正确识别为非 Next.js 项目（应退出）"
    fi
    
    stop_test_server
    return 0
}

test_case_3() {
    log_test "测试用例 3: 端口没有服务，脚本目录是 Next.js 项目"
    
    # 确保端口没有服务
    stop_test_server
    
    local pid=$(get_port_pid $TEST_PORT)
    if [ -n "$pid" ]; then
        log_error "FAILED - 端口 $TEST_PORT 仍有服务运行"
        return 1
    fi
    
    # 检查实际脚本目录（应该是 Next.js 项目）
    if [ -f "$SCRIPT_DIR/../package.json" ] && grep -q '"next":' "$SCRIPT_DIR/../package.json" 2>/dev/null; then
        log_success "PASSED - 脚本所在目录是 Next.js 项目"
    else
        log_info "SKIPPED - 脚本所在目录不是 Next.js 项目（测试环境限制）"
    fi
    
    return 0
}

test_case_4() {
    log_test "测试用例 4: 端口没有服务，脚本目录不是 Next.js 项目"
    
    # 确保端口没有服务
    stop_test_server
    
    local pid=$(get_port_pid $TEST_PORT)
    if [ -n "$pid" ]; then
        log_error "FAILED - 端口 $TEST_PORT 仍有服务运行"
        return 1
    fi
    
    # 创建一个临时的非 Next.js 目录，模拟脚本放错位置
    local fake_script_dir="$TEST_DIR/wrong-location"
    create_non_nextjs_project "$fake_script_dir"
    
    # 验证应该识别为非 Next.js 项目
    if [ ! -f "$fake_script_dir/package.json" ] || ! grep -q '"next":' "$fake_script_dir/package.json" 2>/dev/null; then
        log_success "PASSED - 正确识别非 Next.js 目录（应退出）"
    else
        log_error "FAILED - 错误地识别为 Next.js 项目"
        return 1
    fi
    
    return 0
}

test_case_5() {
    log_test "测试用例 5: 端口没有服务，目录没有 package.json"
    
    stop_test_server
    
    local empty_dir="$TEST_DIR/empty-dir"
    mkdir -p "$empty_dir"
    
    # 验证应该检测到没有 package.json
    if [ ! -f "$empty_dir/package.json" ]; then
        log_success "PASSED - 正确检测到没有 package.json（应退出）"
    else
        log_error "FAILED - 错误地认为有 package.json"
        return 1
    fi
    
    return 0
}

test_port_detection() {
    log_test "测试: 端口检测功能 (Linux ss/netstat)"
    
    local project_dir="$TEST_DIR/port-test"
    mkdir -p "$project_dir"
    
    if ! start_test_server "$project_dir" $TEST_PORT; then
        log_error "FAILED - 无法启动测试服务器"
        return 1
    fi
    
    # 测试 ss 命令
    if command -v ss &> /dev/null; then
        log_info "使用 ss 命令测试..."
        local ss_output=$(ss -tlnp 2>/dev/null | grep ":$TEST_PORT " || echo "")
        if [ -n "$ss_output" ]; then
            log_success "ss 命令检测成功"
            log_info "ss 输出: $ss_output"
        else
            log_error "ss 命令未检测到端口"
        fi
    fi
    
    # 测试 netstat 命令
    if command -v netstat &> /dev/null; then
        log_info "使用 netstat 命令测试..."
        local netstat_output=$(netstat -tlnp 2>/dev/null | grep ":$TEST_PORT " || echo "")
        if [ -n "$netstat_output" ]; then
            log_success "netstat 命令检测成功"
            log_info "netstat 输出: $netstat_output"
        else
            log_info "netstat 命令未检测到端口（可能需要 root 权限）"
        fi
    fi
    
    # 测试封装的函数
    local pid=$(get_port_pid $TEST_PORT)
    if [ -n "$pid" ]; then
        log_success "get_port_pid 函数检测成功: PID=$pid"
    else
        log_error "get_port_pid 函数未检测到进程"
    fi
    
    stop_test_server
    return 0
}

test_cwd_detection() {
    log_test "测试: 进程工作目录检测 (Linux /proc, macOS lsof)"
    
    local project_dir="$TEST_DIR/cwd-test"
    mkdir -p "$project_dir"
    
    # 规范化路径用于比对
    local normalized_project_dir=$(normalize_path "$project_dir")
    
    if ! start_test_server "$project_dir" $TEST_PORT; then
        log_error "FAILED - 无法启动测试服务器"
        return 1
    fi
    
    local pid=$(get_port_pid $TEST_PORT)
    if [ -z "$pid" ]; then
        log_error "FAILED - 无法获取进程 PID"
        stop_test_server
        return 1
    fi
    
    # 测试 /proc/PID/cwd (Linux only)
    if [ "$OS" = "linux" ]; then
        if [ -L "/proc/$pid/cwd" ]; then
            local proc_cwd=$(readlink -f /proc/$pid/cwd 2>/dev/null || echo "")
            log_info "/proc/$pid/cwd -> $proc_cwd"
            
            if [ "$proc_cwd" = "$normalized_project_dir" ]; then
                log_success "/proc 方式检测成功"
            else
                log_error "/proc 方式检测目录不匹配"
                log_error "  期望: $normalized_project_dir"
                log_error "  实际: $proc_cwd"
            fi
        else
            log_error "/proc/$pid/cwd 不存在"
        fi
    fi
    
    # 测试封装的函数
    local cwd=$(get_process_cwd $pid)
    local normalized_cwd=$(normalize_path "$cwd")
    if [ "$normalized_cwd" = "$normalized_project_dir" ]; then
        log_success "get_process_cwd 函数检测成功"
    else
        log_error "get_process_cwd 函数检测失败"
        log_error "  期望: $normalized_project_dir"
        log_error "  实际: $normalized_cwd"
        stop_test_server
        return 1
    fi
    
    stop_test_server
    return 0
}

# ============================================================
# 主测试逻辑
# ============================================================
main() {
    echo ""
    echo "========================================"
    echo "  upgrade-security.sh 测试套件"
    echo "========================================"
    echo ""
    
    detect_os
    log_info "操作系统: $OS"
    log_info "测试目录: $TEST_DIR"
    log_info "测试端口: $TEST_PORT"
    echo ""
    
    local passed=0
    local failed=0
    local skipped=0
    
    # 运行测试
    echo "----------------------------------------"
    echo "基础功能测试"
    echo "----------------------------------------"
    
    if test_port_detection; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    if test_cwd_detection; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    echo "----------------------------------------"
    echo "业务逻辑测试"
    echo "----------------------------------------"
    
    if test_case_1; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    if test_case_2; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    if test_case_3; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    if test_case_4; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    if test_case_5; then
        ((passed++))
    else
        ((failed++))
    fi
    echo ""
    
    # 输出结果
    echo "========================================"
    echo "  测试结果"
    echo "========================================"
    echo ""
    echo "  ✅ 通过: $passed"
    echo "  ❌ 失败: $failed"
    echo ""
    
    if [ $failed -eq 0 ]; then
        log_success "所有测试通过！"
        exit 0
    else
        log_error "有 $failed 个测试失败"
        exit 1
    fi
}

main "$@"
