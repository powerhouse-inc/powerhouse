import { Address, AddressProps } from './address';
import { Errors, ErrorsProps } from './errors';
import { Operation, OperationProps } from './operation';
import { RevisionNumber, RevisionNumberProps } from './revision-number';
import { Signature, SignatureProps } from './signature';
import { Timestamp, TimestampProps } from './timestamp';

type Props = RevisionNumberProps &
    OperationProps &
    AddressProps &
    TimestampProps &
    SignatureProps &
    ErrorsProps;
export function Revision(props: Props) {
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
