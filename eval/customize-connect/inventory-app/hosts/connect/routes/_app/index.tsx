import {
  ConnectHomeScreen,
  HomeAddDriveItem,
  HomeDriveItem,
  useVisibleDrives,
} from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app/index";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Box } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  ...options,
  component: InventoryHome,
});

function InventoryCard() {
  return (
    <Link
      to="/inventory"
      // `relative`: ConnectHomeScreen paints a fixed background layer that covers unpositioned children.
      className="relative flex h-24 w-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md p-2 text-center text-sm text-foreground hover:hover-effect"
      data-testid="inventory-card"
    >
      <Box size={32} />
      <span>Inventory</span>
      <span className="text-xs text-muted-foreground">
        Every item, every drive
      </span>
    </Link>
  );
}

function InventoryHome() {
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
