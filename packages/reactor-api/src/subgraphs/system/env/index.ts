import dotenv from "dotenv";
import { getAdminUsers } from "./getters";

dotenv.config();

export const ADMIN_USERS = getAdminUsers();
