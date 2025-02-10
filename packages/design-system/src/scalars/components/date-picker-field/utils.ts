export const ALLOWED_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MMM-yyyy",
  "MMM-dd-yyyy",
];

export const isFormatAllowed = (format: string) =>
  ALLOWED_FORMATS.includes(format);
