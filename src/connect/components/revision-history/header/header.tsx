import { Icon } from '@/powerhouse';
import { ReactNode } from 'react';
import { Scope as TScope } from '../types';
import { Branch } from './branch';
import { DocId } from './doc-id';
import { Scope } from './scope';

type Props = {
    title: ReactNode;
    docId: string;
    scope: TScope;
    onChangeScope: (scope: TScope) => void;
    onClose: () => void;
};

export function Header(props: Props) {
    const { title, docId, scope, onChangeScope, onClose } = props;
    return (
        <header className="flex items-center justify-between bg-transparent">
            <div className="flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="rounded-lg bg-gray-50 p-1 text-slate-100 shadow-button"
                >
                    <Icon name="VariantArrowLeft" />
                </button>
                <h1 className="text-xs">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
                <DocId docId={docId} />
                <Branch />
                <Scope value={scope} onChange={onChangeScope} />
            </div>
        </header>
    );
}
