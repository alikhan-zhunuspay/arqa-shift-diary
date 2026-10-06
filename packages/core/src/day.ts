/**
 * Часовой пояс по умолчанию — Казахстан (с 2024 года единый UTC+5).
 * Смену относим к дню по локальному времени водителя, а не по UTC:
 * поездка в 02:00 по Алматы — это «сегодня», хотя в UTC ещё «вчера».
 */
export const DEFAULT_TIME_ZONE = "Asia/Almaty";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Локальная дата (YYYY-MM-DD) момента времени в заданном часовом поясе. */
export function localDate(instant: string | Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA форматирует ровно как YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Поездку относим ко дню, в который она началась. */
export function tripDay(trip: { start: string }, timeZone: string = DEFAULT_TIME_ZONE): string {
  return localDate(trip.start, timeZone);
}

export function isValidDay(day: string): boolean {
  if (!DATE_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Сдвиг календарного дня: shiftDay("2026-10-01", -1) === "2026-09-30". */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
