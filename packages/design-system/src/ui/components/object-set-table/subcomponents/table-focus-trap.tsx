import { FocusTrap } from "focus-trap-react";
import { useRef } from "react";
import { useOnClickOutside } from "usehooks-ts";
import { useInternalTableState } from "./table-provider/table-provider.js";

const TableFocusTrap = ({ children }: { children: React.ReactNode }) => {
  const {
    state: { selectedCellIndex },
    api,
  } = useInternalTableState();
  const ref = useRef<HTMLTableElement>(null);

  useOnClickOutside(ref, () => {
    api.selection.clear();
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
