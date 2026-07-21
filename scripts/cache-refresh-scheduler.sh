#!/usr/bin/env bash
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${ALLOCATION_CACHE_STATE_DIR:-$PROJECT_ROOT/.cache-refresh-state}"
CHECK_INTERVAL_SECONDS="${ALLOCATION_CACHE_SCHEDULER_INTERVAL_SECONDS:-30}"

if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env.local"
  set +a
fi

mkdir -p "$STATE_DIR"

run_refresh() {
  local label="$1"
  echo "[$(date '+%F %T')] $label：刷新昨天及此前两天"
  ALLOCATION_CACHE_ROLLING_DAYS="${ALLOCATION_CACHE_ROLLING_DAYS:-3}" \
    bash "$PROJECT_ROOT/scripts/refresh-recent-cache.sh"
}

while true; do
  today="$(date '+%F')"
  hour="$(date '+%H')"
  first_attempt="$STATE_DIR/$today.first-attempt"
  failed_marker="$STATE_DIR/$today.failed"
  success_marker="$STATE_DIR/$today.success"
  retry_attempt="$STATE_DIR/$today.retry-attempt"

  # 10点后即使守护进程晚启动，也会补执行一次，不要求恰好在10:00存活。
  if (( 10#$hour >= 10 )) && [[ ! -e "$first_attempt" && ! -e "$success_marker" ]]; then
    touch "$first_attempt"
    if run_refresh "每日10点任务"; then
      rm -f "$failed_marker"
      touch "$success_marker"
    else
      touch "$failed_marker"
    fi
  fi

  # 11点后仅对10点失败的任务重试一次。
  if (( 10#$hour >= 11 )) && [[ -e "$failed_marker" && ! -e "$retry_attempt" ]]; then
    touch "$retry_attempt"
    if run_refresh "每日11点失败重试"; then
      rm -f "$failed_marker"
      touch "$success_marker"
    fi
  fi

  find "$STATE_DIR" -type f -mtime +7 -delete 2>/dev/null || true
  sleep "$CHECK_INTERVAL_SECONDS"
done
