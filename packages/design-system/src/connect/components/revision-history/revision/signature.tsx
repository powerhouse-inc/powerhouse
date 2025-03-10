import { Tooltip } from "#connect";
import { Icon } from "#powerhouse";
import { type Signature } from "../types.js";

export type SignatureProps = {
  readonly signatures: Signature[] | undefined;
};
export function Signature(props: SignatureProps) {
  const { signatures } = props;

  if (!signatures?.length) return null;

  const tooltipContent = (
    <div className="text-xs text-slate-300">
      <h3 className="mb-2">Signature details:</h3>
      {signatures.map((signature, index) => (
        <div className="mb-2 last:mb-0" key={signature.hash}>
          <h4>
            Signature #{index + 1} -{" "}
            {signature.isVerified ? "verified" : "unverified"}
          </h4>
          <code>
            <pre>{JSON.stringify(signature, null, 2)}</pre>
          </code>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span className="flex w-fit cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2 py-1">
        <VerificationStatus signatures={signatures} />{" "}
        <Icon className="text-gray-300" name="InfoSquare" size={16} />
      </span>
    </Tooltip>
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
  const color =
    verifiedSignaturesCount === 0
      ? "text-red-800"
      : verifiedSignaturesCount === signatureCount
        ? "text-green-700"
        : "text-orange-700";

  return <span className={`text-xs ${color}`}>{verificationStatusText}</span>;
}
