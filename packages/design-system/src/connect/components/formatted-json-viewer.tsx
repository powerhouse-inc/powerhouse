import { useTheme } from "@powerhousedao/reactor-browser";
import { JsonView, type JsonViewProps } from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { lightTheme } from "@uiw/react-json-view/light";
import { isStrictEqual, isString } from "remeda";
import { Icon } from "../../powerhouse/index.js";

/* Shows arbitrary JSON content in a nicely formatted viewer.
 * Takes all the same props as the JSON view React component.
 * Provides some quality of life improvements:
 *
 * allows expand and collapse of any / all of the rendered fields
 * Allows copy-paste of the whole object as well as individual fields, with a success indicator
 * Formats very long text fields so that they are first truncated, and then if expanded word wrap applies
 */
export function FormattedJsonViewer(props: JsonViewProps<object>) {
  const { theme } = useTheme();
  const style = theme === "light" ? lightTheme : darkTheme;
  return (
    <JsonView
      displayDataTypes={false}
      displayObjectSize={false}
      style={style}
      {...props}
    >
      <JsonView.Copied
        render={({ onClick, ...props }) => {
          if ((props as { "data-copied": boolean })["data-copied"]) {
            return (
              <Icon
                {...props}
                className="inline-block text-success"
                name="FilesEarmark"
                size={16}
              />
            );
          }
          return (
            <Icon
              {...props}
              onClick={onClick}
              className="inline-block cursor-pointer text-foreground"
              name="FilesEarmark"
              size={16}
            />
          );
        }}
      />
      <JsonView.String
        render={({ children, ...rest }, { value, keyName }) => {
          // strings are truncated with ellipsis at 30 chars in this component by default
          const maxLength = 30;
          if (
            // if the children are a plain string, we know this is a text node
            isString(children) &&
            // the value should therefore also be a string
            isString(value) &&
            // when the content is truncated, the children will be the truncated content
            // and the value will be the original content
            // we know that the content is not truncated if the value and the children are the same
            isStrictEqual(children, value) &&
            // if the string is long then apply word wrap to avoid letting the parent component put everything
            // on one line
            value.length > maxLength
          ) {
            return (
              /* use inline grid so that this text is still aligned with the field name */
              <span {...rest} className="inline-grid">
                <span
                  // We must wrap anywhere because data can be of any length
                  // do not use hyphens, show the raw content
                  // apply one character of left padding and negative indent because of the string quotation mark
                  className="pl-[1ch] indent-[-1ch] wrap-anywhere hyphens-none"
                  style={{
                    // calculate the line width from the width of the key in the json
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
