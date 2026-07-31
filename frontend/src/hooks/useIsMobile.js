import { useEffect, useState } from "react";

// True on phone-sized viewports, so the app can switch to the bottom-nav shell.
export function useIsMobile(query = "(max-width: 820px)") {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return mobile;
}
