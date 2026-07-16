import { useEffect, useState } from "react";

// Single shared breakpoint for the whole app. Components use this instead of
// CSS media queries because every existing layout is built from inline JS
// style objects (no CSS Modules / Tailwind) — so the mobile override has to
// happen in JS too, or it can never win over the inline desktop style.
export const MOBILE_BREAKPOINT_PX = 640;

export function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
