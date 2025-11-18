import {
  mergeClassNameProps,
  PowerhouseButton,
  type PowerhouseButtonProps,
} from "@powerhousedao/design-system";

export const RWAButton: React.FC<PowerhouseButtonProps> = (props) => {
  return (
    <PowerhouseButton
      color="light"
      size="small"
      {...mergeClassNameProps(
        props,
        "border border-solid border-gray-300 bg-white px-3 py-1 text-sm text-gray-900",
      )}
    >
      {props.children}
    </PowerhouseButton>
  );
};
