import { useEffect, useState } from "react";

export const useWindowSize = () => {
  // Zero on the server; the resize handler takes over in the browser.
  const [windowSize, setWindowSize] = useState(() =>
    typeof window === "undefined"
      ? { innerWidth: 0, innerHeight: 0 }
      : { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
  );

  useEffect(() => {
    const windowSizeHandler = () => {
      setWindowSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
    };

    window.addEventListener("resize", windowSizeHandler);

    return () => {
      window.removeEventListener("resize", windowSizeHandler);
    };
  }, []);

  return windowSize;
};
