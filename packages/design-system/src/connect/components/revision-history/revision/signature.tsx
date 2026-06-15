import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import { CodePopover } from "../../code-popover.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";
import type { Signature } from "../types.js";

export type SignatureProps = {
  readonly signatures: Signature[] | undefined;
};
export function Signature(props: SignatureProps) {
  const { signatures } = props;

  if (!signatures?.length) return null;

  return (
    <CodePopover
      trigger={
        <span className="flex w-fit cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-2 py-1">
          <VerificationStatus signatures={signatures} />{" "}
          <Icon className="text-foreground" name="InfoSquare" size={16} />
        </span>
      }
      content={<FormattedJsonViewer value={signatures} collapsed={1} />}
    />
  );
}

function VerificationStatus(props: SignatureProps) {
  const { signatures } = props;

  if (!signatures?.length) return null;

  const signatureCount = signatures.length;

  const verifiedSignaturesCount = signatures.filter(
    (signature) => signature.isVerified,
  ).length;
  const signatureText = signatureCount === 1 ? "signature" : "signatures";
  const verificationStatusText = `${verifiedSignaturesCount}/${signatureCount} ${signatureText} verified`;

  return (
    <span
      className={twMerge(
        `text-xs`,
        verifiedSignaturesCount === 0
          ? "text-destructive"
          : verifiedSignaturesCount === signatureCount
            ? "text-success"
            : "text-warning",
      )}
    >
      {verificationStatusText}
    </span>
  );
}
