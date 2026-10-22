import {
  ConnectHomeScreen,
  HomeAddDriveItem,
  HomeDriveItem,
  useVisibleDrives,
} from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app/index";
import { useDocumentsOfType } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InventoryItem } from "document-models/inventory-item";
import { Boxes } from "lucide-react";
import { Suspense } from "react";

export const Route = createFileRoute("/_app/")({
  ...options,
  component: StockHome,
});

function StockHome() {
  const drives = useVisibleDrives();
  return (
    <ConnectHomeScreen>
      <InventoryCard />
      {drives?.map((drive) => (
        <HomeDriveItem key={drive.header.id} drive={drive} />
      ))}
      <HomeAddDriveItem />
    </ConnectHomeScreen>
  );
}

function InventoryCard() {
  return (
    <div
      data-testid="inventory-card"
      className="border-border bg-card text-card-foreground relative flex flex-col gap-2 rounded-xl border p-4 shadow-sm"
    >
      <Link to="/inventory" className="flex items-center gap-2 font-semibold">
        <Boxes size={20} className="text-primary" />
        Inventory
      </Link>
      <Suspense
        fallback={
          <span className="text-muted-foreground text-sm">Counting…</span>
        }
      >
        <InventoryCount />
      </Suspense>
      <Link to="/inventory" className="text-primary text-sm hover:underline">
        Open inventory →
      </Link>
    </div>
  );
}

function InventoryCount() {
  const { documents, hasNextPage } = useDocumentsOfType(InventoryItem, {
    limit: 50,
  });
  const units = documents.reduce((sum, d) => sum + d.state.global.quantity, 0);
  return (
    <span className="text-muted-foreground text-sm">
      {documents.length}
      {hasNextPage ? "+" : ""} items · {units} units
    </span>
  );
}
