// Shim for react-router-dom: the editor renders outside any router.
import {
  createElement,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

export function useNavigate(): (to: string | number) => void {
  return () => {};
}

export function useLocation(): { pathname: string; search: string } {
  return { pathname: "/", search: "" };
}

export function useParams(): Record<string, string | undefined> {
  return {};
}

export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams) => void,
] {
  return [new URLSearchParams(), () => {}];
}

export function createSearchParams(
  init?: Record<string, string>,
): URLSearchParams {
  return new URLSearchParams(init);
}

export function Link(
  props: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    children?: ReactNode;
  },
) {
  const { to, children, ...rest } = props;
  return createElement("a", { ...rest, href: to }, children);
}
