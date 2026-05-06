import { JsonView, type JsonViewProps } from "@uiw/react-json-view";
import { isStrictEqual, isString } from "remeda";
import { Icon } from "../../powerhouse/index.js";
const Copied = JsonView.Copied;

export function FormattedJsonViewer(props: JsonViewProps<object>) {
  return (
    <JsonView displayDataTypes={false} displayObjectSize={false} {...props}>
      <Copied
        render={({ onClick, ...props }) => {
          if ((props as { "data-copied": boolean })["data-copied"]) {
            return (
              <Icon
                {...props}
                className="inline-block text-green-800"
                name="FilesEarmark"
                size={16}
              />
            );
          }
          return (
            <Icon
              {...props}
              onClick={onClick}
              className="inline-block cursor-pointer text-gray-600"
              name="FilesEarmark"
              size={16}
            />
          );
        }}
      />
      <JsonView.String
        render={({ children, ...rest }, { value, keyName }) => {
          const maxLength = 30;
          if (
            isString(children) &&
            isString(value) &&
            isStrictEqual(children, value) &&
            value.length > maxLength
          ) {
            return (
              <span {...rest} className="inline-grid">
                <span
                  className="wrap-anywhere hyphens-none pl-[1ch] indent-[-1ch]"
                  style={{
                    maxWidth: `${60 - keyName.toString().length}ch`,
                  }}
                >
                  "{children}"
                </span>
              </span>
            );
          }
          return <span {...rest}>"{children}"</span>;
        }}
      />
    </JsonView>
  );
}
