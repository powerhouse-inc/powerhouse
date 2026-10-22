import { open } from "./mcplib.mjs";
const m = await open();
const PREVIEW = "preview-cea183c0";
let n = 0;
for (let i = 1; i <= 10; i++) {
  const name = `Part ${String(i).padStart(2, "0")}`;
  const c = await m.call("createDocument", { documentType: "parts/inventory-item", name, driveId: PREVIEW });
  const a = await m.call("addActions", { documentId: c.structured?.documentId, actions: [{ type: "ADD_ITEM", input: { name, quantity: i, location: `Bin ${i}` }, scope: "global" }] });
  if (!a.error) n++;
}
console.log("seeded", n);
