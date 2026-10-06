import Constants from "expo-constants";
import { Platform } from "react-native";
import type { DaySummary, Trip, ValidationIssue } from "@shift-diary/core";

export type DayResponse = {
  date: string;
  timeZone: string;
  summary: DaySummary;
  trips: Trip[];
  neighbours: { previous: string | null; next: string | null };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
  /** Сеть/таймаут/5xx — повтор может помочь. 4xx — нет. */
  get retriable(): boolean {
    return this.status === null || this.status >= 500;
  }
}

/**
 * Адрес API: явный EXPO_PUBLIC_API_URL, иначе тот же хост, с которого Metro раздаёт бандл
 * (на реальном телефоне localhost — это сам телефон, а не ноутбук).
 */
function resolveBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host && Platform.OS !== "web") return `http://${host}:3000`;
  if (Platform.OS === "android" && !host) return "http://10.0.2.2:3000";
  return "http://localhost:3000";
}

export const BASE_URL = resolveBaseUrl();
const TIMEOUT_MS = 8_000;

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => controller.abort());

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(signal?.aborted ? "Запрос отменён" : "Нет связи с сервером", null);
  } finally {
    clearTimeout(timer);
  }

  const body = (await response.json().catch(() => ({}))) as T & { message?: string; issues?: ValidationIssue[] };
  if (!response.ok) {
    throw new ApiError(body.message ?? `Ошибка сервера (${response.status})`, response.status, body.issues ?? []);
  }
  return { status: response.status, body };
}

export async function fetchDay(date: string, signal?: AbortSignal): Promise<DayResponse> {
  return (await request<DayResponse>(`/api/days/${date}`, {}, signal)).body;
}

export async function fetchLatestDay(): Promise<string | null> {
  const { body } = await request<{ days: { date: string }[] }>(`/api/days`);
  return body.days[0]?.date ?? null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Отправка поездки с автоповтором. Повтор безопасен: id сгенерирован один раз на клиенте,
 * и сервер на повтор с тем же id отвечает 200 без создания дубля.
 */
export async function createTrip(trip: Trip, attempts = 3): Promise<{ trip: Trip; replayed: boolean }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { status, body } = await request<{ trip: Trip }>(`/api/trips`, { method: "POST", body: JSON.stringify(trip) });
      return { trip: body.trip, replayed: status === 200 };
    } catch (error) {
      if (!(error instanceof ApiError) || !error.retriable || attempt >= attempts) throw error;
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
}
