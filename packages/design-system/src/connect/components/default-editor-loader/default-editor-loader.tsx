import { AnimatedLoader, type DivProps } from "@powerhousedao/design-system";

type DefaultEditorLoaderProps = DivProps & {
  readonly message?: string;
};

export function DefaultEditorLoader(props: DefaultEditorLoaderProps) {
  const { message = "Loading editor", ...divProps } = props;
  return (
    <div className="grid h-full place-items-center" {...divProps}>
      <div className="-mt-20 grid place-items-center">
        <h3 className="mb-4 text-xl">{message}</h3>
        <AnimatedLoader />
      </div>
    </div>
  );
}
