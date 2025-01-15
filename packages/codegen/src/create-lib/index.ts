#! /usr/bin/env node

import { initCli } from "./init";

initCli().catch((e: unknown) => {
  throw e;
});
