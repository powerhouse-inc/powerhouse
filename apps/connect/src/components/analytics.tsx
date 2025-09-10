import connectConfig from "#connect-config";
import { useEffect } from "react";
import { useAcceptedCookies } from "../hooks/useAcceptedCookies";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

function gtag(...args: (string | Date)[]) {
  window.dataLayer?.push(...args);
}

const Analytics = () => {
  const gaTrackingId = connectConfig.gaTrackingId;
  const [{ analytics }] = useAcceptedCookies();
  const useAnalytics = gaTrackingId && analytics;

  useEffect(() => {
    if (useAnalytics) {
      // Create the GA script tag
      const script = document.createElement("script");
      script.src = `https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`;
      script.async = true;
      document.head.appendChild(script);

      // Initialize GA
      window.dataLayer = window.dataLayer || [];

      gtag("js", new Date());
      gtag("config", gaTrackingId);

      // Clean up the script if no longer enabled
      return () => {
        document.head.removeChild(script);
      };
    }
  }, [useAnalytics, gaTrackingId]);

  return null;
};

export default Analytics;
