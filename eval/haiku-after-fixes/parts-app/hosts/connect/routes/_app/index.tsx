import {
  ConnectHomeScreen,
  HomeAddDriveItem,
  HomeDriveItem,
  useVisibleDrives,
} from "@powerhousedao/connect/generic";
import { options } from "@powerhousedao/connect/routes/_app/index";
import { HomeScreenItem } from "@powerhousedao/design-system/connect";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  ...options,
  component: PartsHome,
});

function InventoryCard() {
  const navigate = useNavigate();
  return (
    <HomeScreenItem
      title="Inventory"
      description="Items, quantities and locations"
      onClick={() => void navigate({ to: "/inventory" })}
    />
  );
}

function PartsHome() {
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
