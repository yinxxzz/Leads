#!/usr/bin/env bash
set -u

BASE_URL="${ALLOCATION_CACHE_BASE_URL:-http://127.0.0.1:8000}"
TOKEN="${ALLOCATION_CACHE_REFRESH_TOKEN:-}"
DATE="${1:-}"

if [[ -z "$TOKEN" ]]; then
  echo "缺少 ALLOCATION_CACHE_REFRESH_TOKEN" >&2
  exit 2
fi

payload_for() {
  local channel="$1"
  if [[ -n "$DATE" ]]; then
    printf '{"channel":"%s","date":"%s"}' "$channel" "$DATE"
  else
    printf '{"channel":"%s"}' "$channel"
  fi
}

failed_channels=()
for channel in bpo tmk cc; do
  echo "[$(date '+%F %T')] 开始刷新 $channel"
  if ! curl --fail --silent --show-error \
    --connect-timeout 10 \
    --max-time 900 \
    -X POST "$BASE_URL/api/allocation/cache/refresh" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(payload_for "$channel")"; then
    echo "[$(date '+%F %T')] $channel 刷新失败" >&2
    failed_channels+=("$channel")
  fi
  echo
done

if (( ${#failed_channels[@]} > 0 )); then
  echo "[$(date '+%F %T')] 刷新失败渠道：${failed_channels[*]}" >&2
  exit 1
fi

echo "[$(date '+%F %T')] 三个渠道刷新完成"
