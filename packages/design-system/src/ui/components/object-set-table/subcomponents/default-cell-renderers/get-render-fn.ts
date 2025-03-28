import type { CellType, RenderCellFn } from "../../types.js";
import { renderNumberCell } from "./number-render.js";
import { renderTextCell } from "./text-render.js";

const getRenderFn = <T>(type: CellType | undefined): RenderCellFn<T> => {
  switch (type) {
    case "text":
      return renderTextCell;
    case "number":
      return renderNumberCell;
    default:
      return renderTextCell;
  }
};

export { getRenderFn };
