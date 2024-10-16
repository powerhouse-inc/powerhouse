#! /usr/bin/env node

import { init } from "./init";

init().catch((e: unknown) => {
  throw e;
});
