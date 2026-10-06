import { useEffect, useState } from "react";
import { dateToKey } from "../utils/dates";

export function useToday(): string {
  const [today, setToday] = useState(() => dateToKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const refresh = () => setToday(dateToKey(new Date()));

    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
      );
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, nextMidnight.getTime() - now.getTime());
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
