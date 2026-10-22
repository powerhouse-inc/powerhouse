import { open } from "./mcplib.mjs";
const m = await open();
const r = await m.call("getDocument", { id: process.argv[2] });
console.log("raw:", (r.text || JSON.stringify(r)).slice(0, 200));
const d = JSON.parse(r.text).document;
console.log("top keys:", Object.keys(d));
console.log("operations keys:", d.operations && Object.keys(d.operations));
