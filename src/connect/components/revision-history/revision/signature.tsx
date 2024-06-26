import { Tooltip } from '@/connect';
import { Icon } from '@/powerhouse';
import { useId } from 'react';
import { type Signature } from '../types';

export type SignatureProps = {
    signatures: Signature[] | undefined;
};
export function Signature(props: SignatureProps) {
    const { signatures } = props;
    const tooltipId = useId().replace(/:/g, '');

    if (!signatures?.length) return null;

    const signatureCount = signatures.length;
    const verifiedSignaturesCount = signatures.filter(
        signature => signature.isVerified,
    ).length;
    const signatureText = signatureCount === 1 ? 'signature' : 'signatures';

    function VerificationStatus() {
        const verificationStatusText = `${verifiedSignaturesCount}/${signatureCount} ${signatureText} verified`;
        const color =
            verifiedSignaturesCount === 0
                ? 'text-red-800'
                : verifiedSignaturesCount === signatureCount
                  ? 'text-green-700'
                  : 'text-orange-700';

        return (
            <span className={`text-xs ${color}`}>{verificationStatusText}</span>
        );
    }

    const tooltipContent = signatures.map((signature, index) => {
        return (
            <div key={signature.timestamp} className="mb-2 last:mb-0">
                <h4>
                    Signature #{index + 1} -{' '}
                    {signature.isVerified ? 'verified' : 'unverified'}
                </h4>
                <code>
                    <pre>{JSON.stringify(signature, null, 2)}</pre>
                </code>
            </div>
        );
    });

    return (
        <span className="flex w-fit items-center gap-1 rounded-lg border border-gray-200 px-2 py-1">
            <VerificationStatus />{' '}
            <a id={tooltipId}>
                <Icon name="info-square" className="text-gray-300" size={16} />
            </a>
            <Tooltip anchorSelect={`#${tooltipId}`}>
                <div className="text-xs text-slate-300">
                    <h3 className="mb-2">Signature details:</h3>
                    {tooltipContent}
                </div>
            </Tooltip>
        </span>
    );
}
