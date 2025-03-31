import { FocusTrap } from "focus-trap-react";
import { useRef } from "react";
import { useOnClickOutside } from "usehooks-ts";
import { useInternalTableState } from "./table-provider/table-provider.js";

const TableFocusTrap = ({ children }: { children: React.ReactNode }) => {
  const {
    state: { dispatch, selectedCellIndex },
  } = useInternalTableState();
  const ref = useRef<HTMLTableElement>(null);

  useOnClickOutside(ref, () => {
    dispatch?.({ type: "SELECT_CELL", payload: null });
  });

  //   return children;
  return (
    <div ref={ref}>
      <FocusTrap
        active={!!selectedCellIndex}
        focusTrapOptions={{ allowOutsideClick: true }}
      >
        {children}
      </FocusTrap>
    </div>
  );
};

export { TableFocusTrap };
