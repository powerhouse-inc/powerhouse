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
