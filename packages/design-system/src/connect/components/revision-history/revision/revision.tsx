import { memo } from "react";
import { type Revision as RevisionProps } from "../types.js";
import { Address } from "./address.js";
import { Errors } from "./errors.js";
import { Operation } from "./operation.js";
import { RevisionNumber } from "./revision-number.js";
import { Signature } from "./signature.js";
import { Timestamp } from "./timestamp.js";

export function _Revision(props: RevisionProps) {
  return (
    <article className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <RevisionNumber {...props} />
        <Operation {...props} />
        <Address {...props} />
        <Timestamp {...props} />
      </div>
      <div className="flex items-center gap-1">
        <Signature {...props} />
        <Errors {...props} />
      </div>
    </article>
  );
}

export const Revision = memo(_Revision);
