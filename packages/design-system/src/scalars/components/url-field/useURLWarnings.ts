import { useCallback, useEffect, useState } from "react";

export const useURLWarnings = (value: string) => {
  const [warnings, setWarnings] = useState<string[]>([]);

  const checkForWarnings = useCallback(() => {
    const detectedWarnings: string[] = [];

    try {
      const url = new URL(value);
      // check for unencoded spaces in the URL
      if (value.trim().includes(" ")) {
        detectedWarnings.push("Using unencoded spaces in the URL");
      }
      // check for double slashes in the URL
      if (value.indexOf("//") !== value.lastIndexOf("//")) {
        detectedWarnings.push("Using double slashes in the URL");
      }
      // check for backslashes in the URL
      if (value.includes("\\")) {
        detectedWarnings.push("Using backslashes in the URL");
      }
      // using ? character twice in the URL
      if (value.indexOf("?") !== value.lastIndexOf("?")) {
        detectedWarnings.push("Using ? character twice in the URL");
      }
      // using # character twice in the URL
      if (value.indexOf("#") !== value.lastIndexOf("#")) {
        detectedWarnings.push("Using # character twice in the URL");
      }
      // end with ... maybe it was truncated
      if (value.endsWith("...")) {
        detectedWarnings.push("URL may be truncated");
      }

      // check for incorrect tld
      const tld = url.hostname.split(".").pop()!;
      if (
        [
          "con",
          "comm",
          "comn",
          "cmo",
          "copm",
          "om",
          "ccom",
          "con",
          "nett",
          "orgg",
        ].includes(tld)
      ) {
        detectedWarnings.push("URL may have incorrect top-level domain (TLD)");
      }

      // the user probably forgot the ".""
      if (url.hostname.endsWith("com") && tld.length > 3) {
        detectedWarnings.push("URL may be missing the '.' before the .com");
      }

      setWarnings(detectedWarnings);
    } catch {
      // the url is not valid so we don't check for warnings
    }
  }, [value]);

  // reset warnings when the value is empty or not a valid url
  useEffect(() => {
    if (warnings.length === 0) return;

    if (value === "") {
      setWarnings([]);
    }

    try {
      new URL(value);
    } catch {
      setWarnings([]);
    }
  }, [value, checkForWarnings]);

  return {
    warnings,
    checkForWarnings,
  };
};
