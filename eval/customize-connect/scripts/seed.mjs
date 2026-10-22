const gql = async (query, variables) => {
  const r = await fetch("http://localhost:7189/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400)); return j.data;
};
const drives = { preview: "preview-8e909e2c", vetra: "vetra-8e909e2c" };
const items = [["Washers", "preview", 40, "Shelf A"], ["Screws", "preview", 12, "Shelf B"], ["Hinges", "preview", 3, "Bin 4"],
  ["Brackets", "vetra", 9, "Shelf A"], ["Rivets", "vetra", 100, "Bin 1"], ["Anchors", "preview", 7, "Bin 2"], ["Clamps", "vetra", 5, "Shelf C"]];
let i = 0;
for (const [name, d, qty, loc] of items) {
  const res = await gql(`mutation($n:String!,$p:String){ InventoryItem { createDocument(name:$n, parentIdOrSlug:$p) { id } } }`, { n: name, p: drives[d] });
  const id = res.InventoryItem.createDocument.id ?? res.InventoryItem.createDocument;
  const at = new Date().toISOString();
  await gql(`mutation($id:String,$i:InventoryItem_SetItemDetailsInput!){ InventoryItem { setItemDetails(documentIdOrSlug:$id, input:$i) { id } } }`, { id, i: { name, sku: `SKU-${++i}` } });
  await gql(`mutation($id:String,$i:InventoryItem_MoveItemInput!){ InventoryItem { moveItem(documentIdOrSlug:$id, input:$i) { id } } }`, { id, i: { id: `m${i}`, location: loc, at } });
  await gql(`mutation($id:String,$i:InventoryItem_AddStockInput!){ InventoryItem { addStock(documentIdOrSlug:$id, input:$i) { id } } }`, { id, i: { id: `a${i}`, amount: qty, at } });
  console.log("created", name, id, "in", d);
}
