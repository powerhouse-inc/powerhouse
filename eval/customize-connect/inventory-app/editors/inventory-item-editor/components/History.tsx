import { useSelectedInventoryItemDocument } from "document-models/inventory-item";

export function History() {
  const [document] = useSelectedInventoryItemDocument();
  const { history } = document.state.global;
  if (history.length === 0)
    return <p className="text-sm text-muted-foreground">No movements yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left">
          <th>When</th>
          <th>Kind</th>
          <th>Change</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        {history.map((m) => (
          <tr key={m.id}>
            <td>{new Date(m.at).toLocaleString()}</td>
            <td>{m.kind}</td>
            <td>{m.delta}</td>
            <td>{m.location ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
