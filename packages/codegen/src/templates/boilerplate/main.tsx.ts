import { tsx } from "@tmpl/core";

export const mainTsxTemplate = tsx`
import { startConnect } from "@powerhousedao/connect";
import * as localPackage from "./index.js";

startConnect(localPackage);
`.raw;
