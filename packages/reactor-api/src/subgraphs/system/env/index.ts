import dotenv from "dotenv";
import { getAdminUsers } from "./getters.js";

dotenv.config();

export const ADMIN_USERS = getAdminUsers();
