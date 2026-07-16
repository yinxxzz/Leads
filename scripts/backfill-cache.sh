#!/usr/bin/env bash
set -euo pipefail

START_DATE="${1:-}"
END_DATE="${2:-}"
BASE_URL="${ALLOCATION_CACHE_BASE_URL:-http://127.0.0.1:8000}"
TOKEN="${ALLOCATION_CACHE_REFRESH_TOKEN:-}"

if [[ -z "$START_DATE" || -z "$END_DATE" || -z "$TOKEN" ]]; then
  echo "用法：ALLOCATION_CACHE_REFRESH_TOKEN=... $0 YYYY-MM-DD YYYY-MM-DD" >&2
  exit 2
fi

date_add() {
  local value="$1" days="$2"
  date -d "$value $days days" '+%F'
}

cursor="$START_DATE"
while [[ "$cursor" < "$END_DATE" || "$cursor" == "$END_DATE" ]]; do
  chunk_end="$(date_add "$cursor" 29)"
  if [[ "$chunk_end" > "$END_DATE" ]]; then chunk_end="$END_DATE"; fi

  for channel in bpo tmk cc; do
    echo "[$(date '+%F %T')] 补数 $channel：$cursor ~ $chunk_end"
    curl --fail --silent --show-error \
      --connect-timeout 10 \
      --max-time 14400 \
      -X POST "$BASE_URL/api/allocation/cache/refresh" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$channel\",\"startDate\":\"$cursor\",\"endDate\":\"$chunk_end\"}"
    echo
  done

  cursor="$(date_add "$chunk_end" 1)"
done

echo "[$(date '+%F %T')] 补数完成：$START_DATE ~ $END_DATE"
