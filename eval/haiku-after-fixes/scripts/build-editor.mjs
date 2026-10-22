import { open } from "./mcplib.mjs";
const m = await open();
const c = await m.call("createDocument", { documentType: "powerhouse/document-editor", name: "Inventory Item Editor", driveId: "vetra-cea183c0" });
const id = c.structured?.documentId;
console.log("editor doc", id, JSON.stringify(c).slice(0, 200));
const r = await m.call("addActions", { documentId: id, actions: [
  { type: "SET_EDITOR_NAME", input: { name: "Inventory Item Editor" }, scope: "global" },
  { type: "ADD_DOCUMENT_TYPE", input: { id: "dt-inventory-item", documentType: "parts/inventory-item" }, scope: "global" },
  { type: "SET_EDITOR_STATUS", input: { status: "CONFIRMED" }, scope: "global" },
]});
console.log("actions:", r.error ? JSON.stringify(r.error).slice(0,400) : (r.text || "").slice(0, 300));
