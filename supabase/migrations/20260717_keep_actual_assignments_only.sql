-- 缓存只保留真正下发给销售的记录，清除历史商分池但未实际分配的数据。
DELETE FROM public.allocation_record_cache
WHERE has_actual_assignment IS NOT TRUE;

-- 同步修正每天的缓存状态人数，避免继续显示商分池总量。
UPDATE public.allocation_cache_refreshes AS refresh
SET row_count = counts.row_count
FROM (
  SELECT
    refresh_day.channel
    ,refresh_day.dt
    ,COUNT(cache.user_id)::integer AS row_count
  FROM public.allocation_cache_refreshes AS refresh_day
  LEFT JOIN public.allocation_record_cache AS cache
    ON cache.channel = refresh_day.channel
    AND cache.dt = refresh_day.dt
    AND cache.has_actual_assignment IS TRUE
  GROUP BY refresh_day.channel, refresh_day.dt
) AS counts
WHERE refresh.channel = counts.channel
  AND refresh.dt = counts.dt;
