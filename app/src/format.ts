const NBSP = " ";
const NNBSP = " ";

/** 3900 → "3 900 ₸". Группировку делаем сами: Intl на Hermes/Android ведёт себя по-разному. */
export function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  const digits = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return `${sign}${digits}${NBSP}₸`;
}

/** Часы и минуты момента времени в часовом поясе водителя. */
export function time(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function durationMinutes(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-10-01" → "чт, 1 октября" */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-10-01" → "01.10.2026" */
export function dayShort(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

export function pluralTrips(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "поездка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "поездки";
  return "поездок";
}

/**
 * Собирает ISO-дату из дня и времени "HH:MM" в смещении часового пояса.
 * Если окончание по часам меньше начала — поездка перешла через полночь.
 */
export function buildIso(day: string, hhmm: string, offset: string): string {
  return `${day}T${hhmm}:00${offset}`;
}

export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Смещение часового пояса в формате "+05:00" на указанную дату. */
export function utcOffset(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value; // "GMT+05:00" или "GMT"
    if (part === "GMT") return "+00:00";
    const match = part?.match(/GMT([+-]\d{2}:\d{2})/);
    if (match?.[1]) return match[1];
  } catch {
    // старые движки без longOffset — падаем на дефолт ниже
  }
  return "+05:00";
}
