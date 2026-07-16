#!/usr/bin/env bash
set -euo pipefail

DAYS="${ALLOCATION_CACHE_ROLLING_DAYS:-3}"
if ! [[ "$DAYS" =~ ^[1-9][0-9]*$ ]] || (( DAYS > 31 )); then
  echo "ALLOCATION_CACHE_ROLLING_DAYS 必须是 1 到 31" >&2
  exit 2
fi

for ((offset=DAYS-1; offset>=0; offset--)); do
  refresh_date="$(date -v-"${offset}"d '+%F' 2>/dev/null || date -d "${offset} days ago" '+%F')"
  echo "[$(date '+%F %T')] 回刷 ${refresh_date}"
  bash "$(dirname "$0")/refresh-cache-channels.sh" "$refresh_date"
done
