import { open } from "./mcplib.mjs";
const m = await open();
const r = await m.call("getDocumentModelSchema", { type: process.argv[2] });
const sc = r.structured?.schema ?? r.structured;
const spec = sc.specifications[0];
console.log("state:", spec.state.global.schema.slice(0, 600));
console.log("ops:");
for (const mod of spec.modules) for (const o of mod.operations) console.log(" ", o.name, "|", (o.schema || "").replace(/\s+/g, " ").slice(0, 260));
