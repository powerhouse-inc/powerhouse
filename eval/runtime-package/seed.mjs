const DRIVE = process.argv[2];
const gql = async (query, variables) => {
  const r = await fetch("http://localhost:4415/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400)); return j.data;
};
for (const [name, qty, loc] of [["Hex bolts", 120, "Aisle 1"], ["Wing nuts", 45, "Aisle 2"], ["Pallets", 8, "Dock"]]) {
  const { InventoryItem: { createDocument: { id } } } = await gql(`mutation($n:String!,$p:String){ InventoryItem { createDocument(name:$n, parentIdOrSlug:$p) { id } } }`, { n: name, p: DRIVE });
  await gql(`mutation($id:String,$i:InventoryItem_AddItemInput!){ InventoryItem { addItem(documentIdOrSlug:$id, input:$i) { id } } }`, { id, i: { name, sku: name.slice(0, 3).toUpperCase(), quantity: qty, location: loc } });
  console.log("created", name, id);
}
const d = await gql(`{ findDocuments(search:{type:"stock-app/inventory-item"}) { items { id name state } } }`);
console.log(d.findDocuments.items.map((i) => `${i.name}: ${JSON.stringify(i.state.global ?? i.state)}`).join("\n"));
