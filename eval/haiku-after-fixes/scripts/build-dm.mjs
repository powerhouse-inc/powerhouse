import { open } from "./mcplib.mjs";
import { actions } from "./dm-actions.mjs";
const m = await open();
const docId = process.argv[2];
const r = await m.call("addActions", { documentId: docId, actions });
console.log("err:", r.error ? JSON.stringify(r.error).slice(0, 600) : "none", "isError:", r.isError);
console.log((r.text || "").slice(0, 800));
