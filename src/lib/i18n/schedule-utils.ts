import {
  allScheduleDayGroups,
  beijingScheduleUtcDayBounds,
  getScheduleDateMeta,
} from "@/lib/wc-data";

export function scheduleDateQueryForBeijingDate(
  date: string,
  dateKey: "yesterday" | "today" | "tomorrow" = "today",
): string {
  const bounds = beijingScheduleUtcDayBounds(date);
  return new URLSearchParams({
    dateKey,
    date,
    startUtc: bounds?.startUtc || "",
    endUtc: bounds?.endUtc || "",
  }).toString();
}

export function historicalScheduleDates(now = new Date()): string[] {
  const today = getScheduleDateMeta(now).today.date;
  return allScheduleDayGroups
    .filter((day) => day.date < today)
    .map((day) => day.date);
}

export function upcomingScheduleDates(now = new Date()): string[] {
  const today = getScheduleDateMeta(now).today.date;
  return allScheduleDayGroups
    .filter((day) => day.date > today)
    .map((day) => day.date);
}
