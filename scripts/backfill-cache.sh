#!/usr/bin/env bash
set -euo pipefail

START_DATE="${1:-}"
END_DATE="${2:-}"
BASE_URL="${ALLOCATION_CACHE_BASE_URL:-http://127.0.0.1:8000}"
TOKEN="${ALLOCATION_CACHE_REFRESH_TOKEN:-}"
CHANNEL_LIST="${ALLOCATION_CACHE_BACKFILL_CHANNELS:-bpo tmk cc}"

if [[ -z "$START_DATE" || -z "$END_DATE" || -z "$TOKEN" ]]; then
  echo "用法：ALLOCATION_CACHE_REFRESH_TOKEN=... [ALLOCATION_CACHE_BACKFILL_CHANNELS='cc'] $0 YYYY-MM-DD YYYY-MM-DD" >&2
  exit 2
fi

read -r -a channels <<< "$CHANNEL_LIST"
for channel in "${channels[@]}"; do
  if [[ "$channel" != "bpo" && "$channel" != "tmk" && "$channel" != "cc" ]]; then
    echo "ALLOCATION_CACHE_BACKFILL_CHANNELS 仅支持 bpo / tmk / cc" >&2
    exit 2
  fi
done

includes_channel() {
  local expected="$1" channel
  for channel in "${channels[@]}"; do
    [[ "$channel" == "$expected" ]] && return 0
  done
  return 1
}

date_add() {
  local value="$1" days="$2"
  date -d "$value $days days" '+%F'
}

cursor="$START_DATE"
while [[ "$cursor" < "$END_DATE" || "$cursor" == "$END_DATE" ]]; do
  chunk_end="$(date_add "$cursor" 29)"
  if [[ "$chunk_end" > "$END_DATE" ]]; then chunk_end="$END_DATE"; fi

  for channel in bpo tmk; do
    includes_channel "$channel" || continue
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

  if includes_channel cc; then
    cc_date="$cursor"
    while [[ "$cc_date" < "$chunk_end" || "$cc_date" == "$chunk_end" ]]; do
      echo "[$(date '+%F %T')] 补数 cc：$cc_date"
      curl --fail --silent --show-error \
        --connect-timeout 10 \
        --max-time 1800 \
        -X POST "$BASE_URL/api/allocation/cache/refresh" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"channel\":\"cc\",\"date\":\"$cc_date\"}"
      echo
      cc_date="$(date_add "$cc_date" 1)"
    done
  fi

  cursor="$(date_add "$chunk_end" 1)"
done

echo "[$(date '+%F %T')] 补数完成：$START_DATE ~ $END_DATE；渠道：$CHANNEL_LIST"
