import { open } from "./mcplib.mjs";
const m = await open();
const r = await m.call("getDocument", { id: process.argv[2] });
const d = JSON.parse(r.text).document;
console.log(JSON.stringify(d.state).slice(0, 300), "| name:", d.header.name);
