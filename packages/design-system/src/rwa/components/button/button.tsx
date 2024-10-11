import { Button, ButtonProps, mergeClassNameProps } from "@/powerhouse";
import React from "react";

export const RWAButton: React.FC<ButtonProps> = (props) => {
  return (
    <Button
      color="light"
      size="small"
      {...mergeClassNameProps(
        props,
        "border border-solid border-gray-300 bg-white px-3 py-1 text-sm text-gray-900",
      )}
    >
      {props.children}
    </Button>
  );
};
