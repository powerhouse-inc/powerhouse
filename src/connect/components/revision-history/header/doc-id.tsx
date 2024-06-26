import { Icon } from '@/powerhouse';
import { useCopyToClipboard } from 'usehooks-ts';

type Props = {
    docId: string;
};
export function DocId(props: Props) {
    const { docId } = props;
    const [, copy] = useCopyToClipboard();

    function handleCopy(text: string) {
        return () => {
            copy(text).catch(error => {
                console.error('Failed to copy!', error);
            });
        };
    }

    return (
        <button
            className="flex h-8 items-center gap-1 rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-slate-100"
            onClick={handleCopy(docId)}
        >
            <Icon name="link" />
            DOC ID
            <span className="text-gray-900">{docId}</span>
        </button>
    );
}
