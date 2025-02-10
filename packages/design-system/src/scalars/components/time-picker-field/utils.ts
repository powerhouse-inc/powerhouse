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
