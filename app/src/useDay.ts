import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchDay, type DayResponse } from "./api";

type State =
  | { status: "loading"; data: DayResponse | null }
  | { status: "ready"; data: DayResponse }
  | { status: "error"; data: DayResponse | null; error: string };

/**
 * Загрузка дня. При быстром листании дней старые запросы отменяются,
 * чтобы поздний ответ за «вчера» не перетёр уже показанное «сегодня».
 */
export function useDay(date: string) {
  const [state, setState] = useState<State>({ status: "loading", data: null });
  const [refreshing, setRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (mode === "refresh") setRefreshing(true);
      // Оставляем прошлые данные только для этого же дня, чтобы не мигать чужими цифрами.
      else setState((prev) => ({ status: "loading", data: prev.data?.date === date ? prev.data : null }));

      try {
        const data = await fetchDay(date, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", data });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : "Не удалось загрузить данные";
        setState((prev) => ({ status: "error", data: prev.data?.date === date ? prev.data : null, error: message }));
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    },
    [date],
  );

  useEffect(() => {
    void load("initial");
    return () => controllerRef.current?.abort();
  }, [load]);

  return { state, refreshing, reload: () => load("initial"), refresh: () => load("refresh") };
}
