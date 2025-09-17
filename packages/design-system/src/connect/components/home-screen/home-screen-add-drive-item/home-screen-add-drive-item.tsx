import { HomeScreenItem, Icon } from "@powerhousedao/design-system";

type HomeScreenAddDriveItemProps = {
  readonly containerClassName?: string;
  readonly onClick?: () => void;
};
export const HomeScreenAddDriveItem = function HomeScreenAddDriveItem(
  props: HomeScreenAddDriveItemProps,
) {
  const { containerClassName, onClick } = props;
  return (
    <HomeScreenItem
      title="Create New Drive"
      icon={<Icon name="PlusSquare" size={32} />}
      onClick={onClick}
      containerClassName={containerClassName}
    />
  );
};
