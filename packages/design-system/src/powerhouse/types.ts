import type {
  CSSProperties,
  ComponentPropsWithRef,
  ComponentPropsWithoutRef,
} from "react";

export type * from "./components/types.js";
export type DivProps = ComponentPropsWithoutRef<"div">;
export type DivWithRefProps = ComponentPropsWithRef<"div">;

export type Size = CSSProperties["width"];
export type Color = CSSProperties["color"];
