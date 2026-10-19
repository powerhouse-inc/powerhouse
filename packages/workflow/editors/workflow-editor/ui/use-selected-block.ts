import { useSearchParam } from "../../shared/url-param.js";
import { STEP_PARAM, TAB_PARAM, VARIABLES_VIEW } from "./model.js";

const VARIABLES_PARAM = "variables";

/** The open panel, kept in the `step` param. Each pick is a history entry, so
 * back closes it; a new pick starts on the step's first tab. */
export function useSelectedBlock() {
  const [param, setParam] = useSearchParam<string>(STEP_PARAM, "");
  const selectedId = param === VARIABLES_PARAM ? VARIABLES_VIEW : param || null;
  const select = (id: string | null) =>
    setParam(id === VARIABLES_VIEW ? VARIABLES_PARAM : (id ?? ""), {
      also: id === selectedId ? undefined : { [TAB_PARAM]: undefined },
    });
  return [selectedId, select] as const;
}
