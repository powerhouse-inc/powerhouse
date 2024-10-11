import ms from "ms";

export const getJwtSecret = (): string => {
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is not defined");
    }
  }
  return process.env.JWT_SECRET || "dev";
};

export const getJwtExpirationPeriod = (): string => {
  if (!process.env.JWT_EXPIRATION_PERIOD) {
    return "7d";
  }
  // check if number of seconds is provided
  const expirationSeconds = Number(process.env.JWT_EXPIRATION_PERIOD);
  if (!Number.isNaN(expirationSeconds)) {
    // https://www.npmjs.com/package/jsonwebtoken for `expiresIn` format
    return ms(expirationSeconds * 1000);
  }
  // check if a valid time string is provided
  const expirationMs = ms(process.env.JWT_EXPIRATION_PERIOD);
  if (!expirationMs) {
    throw new Error(
      "JWT_EXPIRATION_PERIOD must be a number of seconds or ms string",
    );
  }
  return process.env.JWT_EXPIRATION_PERIOD;
};
