import { useEffect, useState } from "react";

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function useIsDarkMode() {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return dark;
}
