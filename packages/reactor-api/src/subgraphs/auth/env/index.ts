import dotenv from "dotenv";
import { getJwtExpirationPeriod, getJwtSecret } from "./getters.js";

dotenv.config();

export const JWT_SECRET = getJwtSecret();
export const PORT = process.env.PORT ?? "3000";
export const isDevelopment = process.env.NODE_ENV === "development";
export const AUTH_SIGNUP_ENABLED = Boolean(process.env.AUTH_SIGNUP_ENABLED);
export const JWT_EXPIRATION_PERIOD: string = getJwtExpirationPeriod();
export const API_ORIGIN = process.env.API_ORIGIN || `http://localhost:${PORT}`;
export const CORS_ORIGINS = process.env.ORIGINS?.split(",") ?? [
  "https://studio.apollographql.com",
  "https://ph-switchboard-nginx-prod-c84ebf8c6e3b.herokuapp.com",
];
