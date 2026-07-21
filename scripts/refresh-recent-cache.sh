#!/usr/bin/env bash
set -euo pipefail

DAYS="${ALLOCATION_CACHE_ROLLING_DAYS:-3}"
if ! [[ "$DAYS" =~ ^[1-9][0-9]*$ ]] || (( DAYS > 31 )); then
  echo "ALLOCATION_CACHE_ROLLING_DAYS 必须是 1 到 31" >&2
  exit 2
fi

# 数仓每天凌晨产出前一天数据，因此只刷新已完整产出的日期，不刷新当天空分区。
# DAYS=3 时依次刷新：大前天、前天、昨天。
for ((offset=DAYS; offset>=1; offset--)); do
  refresh_date="$(date -v-"${offset}"d '+%F' 2>/dev/null || date -d "${offset} days ago" '+%F')"
  echo "[$(date '+%F %T')] 回刷 ${refresh_date}"
  bash "$(dirname "$0")/refresh-cache-channels.sh" "$refresh_date"
done
