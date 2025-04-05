const defaultValueFormatter = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  // it is ok if the value is an object and we something like `[object Object]`
  // in such case, the developer would have to use a custom value formatter
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
};

export { defaultValueFormatter };
