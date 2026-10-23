// PGlite parses `timestamp` (no tz) columns as local time; read-model columns
// store UTC, so parse them as UTC or values shift by the host's TZ offset.
export const PGLITE_UTC_PARSERS = {
  // 1114 = timestamp without time zone
  1114: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
} as const;
