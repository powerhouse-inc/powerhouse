import type { ComponentProps } from "react";
import type { iconNames } from "./index.js";

export type IconName = (typeof iconNames)[number];
export type IconComponentProps = ComponentProps<"svg">;
