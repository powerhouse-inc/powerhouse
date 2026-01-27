import { Icon } from "@powerhousedao/design-system";
import { useCopyToClipboard } from "usehooks-ts";

type Props = {
  readonly docId: string;
  readonly onCopy?: () => void;
};
export function DocId(props: Props) {
  const { docId, onCopy } = props;
  const [, copy] = useCopyToClipboard();

  function handleCopy(text: string) {
    return () => {
      copy(text)
        .then(() => {
          onCopy?.();
        })
        .catch((error) => {
          console.error("Failed to copy!", error);
        });
    };
  }

  return (
    <button
      className="flex h-8 w-fit items-center gap-1 rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-stone-300"
      onClick={handleCopy(docId)}
    >
      <Icon name="Link" />
      DOC ID
      <span className="text-gray-900">{docId}</span>
    </button>
  );
}
