export type BaseProps<T extends HTMLElement = HTMLDivElement> = {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children?: React.ReactNode;
  containerProps?: Omit<React.HTMLAttributes<T>, "className" | "style" | "id">;
};
