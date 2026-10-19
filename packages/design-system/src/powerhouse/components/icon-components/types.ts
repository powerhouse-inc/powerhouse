import type { ComponentProps } from "react";
import type { iconNames } from "./names.js";

export type IconName = (typeof iconNames)[number];
export type IconComponentProps = ComponentProps<"svg">;
