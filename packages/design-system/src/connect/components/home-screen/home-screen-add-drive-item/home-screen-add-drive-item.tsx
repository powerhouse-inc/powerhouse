import { showPHModal } from "@powerhousedao/reactor-browser";
import { Icon } from "../../../../powerhouse/components/icon/icon.js";
import { HomeScreenItem } from "../home-screen-item/home-screen-item.js";
type HomeScreenAddDriveItemProps = {
  readonly containerClassName?: string;
};
export const HomeScreenAddDriveItem = function HomeScreenAddDriveItem(
  props: HomeScreenAddDriveItemProps,
) {
  const { containerClassName } = props;
  return (
    <HomeScreenItem
      title="Create New Drive"
      icon={<Icon name="PlusSquare" size={32} />}
      onClick={() => showPHModal({ type: "addDrive" })}
      containerClassName={containerClassName}
    />
  );
};
