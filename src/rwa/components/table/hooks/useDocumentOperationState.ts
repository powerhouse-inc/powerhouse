import { Operation, RealWorldAssetsState } from '@/rwa';
import { useEffect, useMemo, useState } from 'react';

type Props = {
    state: RealWorldAssetsState;
};
export function useDocumentOperationState({ state }: Props) {
    const [operation, setOperation] = useState<Operation>(null);
    const [existingState, setExistingState] = useState(() => state);

    const showForm = operation !== null;

    useEffect(() => {
        setExistingState(state);
        // we specifically want to avoid re-rendering the `existingState`
        // when state changes because its purpose is to maintain a stable state while we are editing or creating
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [operation]);

    return useMemo(
        () => ({
            operation,
            setOperation,
            showForm,
            existingState,
        }),
        [operation, setOperation, showForm, existingState],
    );
}
