import { afterAll } from "vitest";
import { stopRuntimes } from "./helpers/started-runtimes.js";

afterAll(stopRuntimes);
