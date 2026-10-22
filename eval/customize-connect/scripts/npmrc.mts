import fs from "node:fs";
import { writeNpmrc } from "/home/user/powerhouse/test/e2e-utils/src/index.ts";
writeNpmrc(process.argv[2], fs.readFileSync("/tmp/connect-eval/.token", "utf8").trim());
