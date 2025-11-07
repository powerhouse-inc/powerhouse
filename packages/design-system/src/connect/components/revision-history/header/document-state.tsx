import { useCopyToClipboard } from "usehooks-ts";
import { Icon } from "../../../../powerhouse/components/icon/icon.js";

export type DocumentStateProps = {
  readonly documentState: object;
  readonly onCopyState?: () => void;
};

export const DocumentState = (props: DocumentStateProps) => {
  const { documentState, onCopyState } = props;
  const [, copy] = useCopyToClipboard();

  function handleCopy() {
    const jsonState = JSON.stringify(documentState, null, 2);
    copy(jsonState)
      .then(() => {
        onCopyState?.();
      })
      .catch((error) => {
        console.error("Failed to copy document state!", error);
      });
  }

  return (
    <button
      className="rounded-lg bg-slate-50 p-1 text-stone-300"
      onClick={handleCopy}
    >
      <Icon name="CurlyBrackets" />
    </button>
  );
};
