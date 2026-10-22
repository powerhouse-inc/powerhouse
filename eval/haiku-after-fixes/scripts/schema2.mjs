import { open } from "./mcplib.mjs";
const m = await open();
const r = await m.call("getDocumentModelSchema", { type: "powerhouse/document-editor" });
const sc = r.structured?.schema ?? r.structured;
const spec = sc.specifications[0];
console.log(spec.state.global.schema.split("\n").filter(l=>!l.includes('"""')).join("\n").slice(0,1800));
console.log("initial:", spec.state.global.initialValue);
