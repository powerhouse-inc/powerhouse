import { open } from "./mcplib.mjs";
const m = await open();
const VETRA = "vetra-cea183c0", PREVIEW = "preview-cea183c0";
const items = [
  [PREVIEW, "M6 Bolt", 120, "Rack A1"],
  [PREVIEW, "Gasket Set", 14, "Shelf B2"],
  [VETRA, "Bearing 6204", 40, "Bin C7"],
];
const out = [];
for (const [drive, name, qty, loc] of items) {
  const c = await m.call("createDocument", { documentType: "parts/inventory-item", name, driveId: drive });
  const id = c.structured?.documentId;
  const a = await m.call("addActions", { documentId: id, actions: [{ type: "ADD_ITEM", input: { name, quantity: qty, location: loc }, scope: "global" }] });
  out.push({ drive, name, id, ok: !a.error && !a.isError, res: a.text?.slice(0, 80) });
}
console.log(JSON.stringify(out, null, 1));
