import { setSelectedNode, useDrives } from "@powerhousedao/reactor-browser";
import { CreateTestDocument } from "./components/create-test-document.js";

export default function Editor() {
  const drives = useDrives();
  return (
    <>
      <CreateTestDocument />
      <h1>Drives:</h1>
      {drives?.map((drive) => (
        <button
          key={drive.header.id}
          onClick={() => {
            setSelectedNode(drive.header.id);
          }}
        >
          {drive.header.name}
        </button>
      ))}
    </>
  );
}
