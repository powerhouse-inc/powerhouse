import dotenv from "dotenv";
import { getAdminUsers } from "./getters.js";

// `dotenv.config()` reads a .env file relative to `process.cwd()`. This module
// is pulled in whenever a package's subgraph is loaded, including by the
// reactor's CDN/edge package loader, whose runtime has no full `process`
// (`process.cwd` is not a function). Calling it there throws
// "process.cwd is not a function" and aborts package loading. Guard it: only
// load a .env file in a real Node context — elsewhere env already lives in
// `process.env`, so there is nothing to load.
if (typeof process !== "undefined" && typeof process.cwd === "function") {
  dotenv.config();
}

export const ADMIN_USERS = getAdminUsers();
