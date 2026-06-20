import { getAggregatedMatches } from "@/lib/data-sources/aggregate";
import { beijingScheduleUtcDayBounds, getScheduleDateMeta, normalizeScheduleDate, normalizeScheduleUtcDayBounds, type ScheduleDateKey } from "@/lib/wc-data";
import { TodayScheduleScreen } from "@/components/screens/TodayScheduleScreen";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let initialMatches: Awaited<ReturnType<typeof getAggregatedMatches>>["matches"] = [];
  try {
    const now = new Date();
    const scheduleDates = getScheduleDateMeta(now);
    const bounds = beijingScheduleUtcDayBounds(scheduleDates.today.date);
    const dateRange = normalizeScheduleUtcDayBounds({
      date: scheduleDates.today.date,
      startUtc: bounds?.startUtc,
      endUtc: bounds?.endUtc,
    });
    const result = await getAggregatedMatches("today", { cacheMode: "cache-only", sourceDate: scheduleDates.today.date, dateRange });
    initialMatches = result.matches;
  } catch {
    // SSR failed, client will fetch
  }
  return <TodayScheduleScreen initialMatches={initialMatches} />;
}
