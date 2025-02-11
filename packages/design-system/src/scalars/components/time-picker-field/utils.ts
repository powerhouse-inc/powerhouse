export const createChangeEvent = (
  value: string,
): React.ChangeEvent<HTMLInputElement> => {
  const nativeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperty(nativeEvent, "target", {
    value: { value },
    writable: false,
  });

  return nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>;
};

export const ALLOWED_TIME_FORMATS = ["hh:mm a", "HH:mm", "hh:mm A"];

export const isFormatTimeAllowed = (format: string): boolean => {
  return ALLOWED_TIME_FORMATS.includes(format);
};

export const TIME_PATTERNS = {
  /** Matches times in 24-hour format (HH:mm) like: 0:00, 09:30, 23:59 */
  HOURS_24: /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/,
  /** Matches times in 12-hour format (h:mm a) like: 1:00 AM, 12:59 PM */
  HOURS_12: /^(0?[1-9]|1[0-2]):([0-5][0-9])\s(AM|PM|am|pm)$/,
} as const;
