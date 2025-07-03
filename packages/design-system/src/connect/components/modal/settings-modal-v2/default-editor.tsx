import { SelectFieldRaw, type SelectOption } from "#ui";
import { twMerge } from "tailwind-merge";

type Props = {
  documentModelEditor: string;
  setDocumentModelEditor: (value: string) => void;
  documentModelEditorOptions: SelectOption[];
  className?: string;
};

export function DefaultEditor(props: Props) {
  const { className, ...rest } = props;
  return (
    <div className={twMerge("rounded-lg p-3", className)}>
      <DefaultEditorSelect {...rest} />
    </div>
  );
}

export function DefaultEditorSelect(props: Props) {
  const {
    documentModelEditor,
    setDocumentModelEditor,
    documentModelEditorOptions,
    className,
  } = props;

  return (
    <div>
      <h3 className="mb-4 font-semibold text-gray-900">
        Default Editor Selection
      </h3>
      <SelectFieldRaw
        className={twMerge("min-w-36 max-w-fit", className)}
        name="default-editor"
        required
        value={documentModelEditor}
        options={documentModelEditorOptions}
        multiple={false}
        onChange={(value) => setDocumentModelEditor(value as string)}
      />
    </div>
  );
}
