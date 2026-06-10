import { useEffect, useRef, useState } from "react";

export function useCountUp(target, duration = 550) {
  const numeric = typeof target === "number" ? target : Number(target);
  const isNum = Number.isFinite(numeric);
  const [display, setDisplay] = useState(isNum ? numeric : 0);
  const prevRef = useRef(isNum ? numeric : 0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isNum) return;
    const from = prevRef.current;
    if (from === numeric) return;

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (numeric - from) * ease));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = numeric;
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      prevRef.current = numeric;
    };
  }, [numeric, isNum, duration]);

  return isNum ? display : target;
}
