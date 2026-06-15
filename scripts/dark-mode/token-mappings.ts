import { mapKeys, mapValues, pipe } from "remeda";
import { makeAncillaryClasses } from "./utils.js";

const text = {
  "text-gray-900": "text-foreground",
  "text-gray-800": "text-foreground",
  "text-gray-700": "text-foreground",
  "text-gray-600": "text-muted-foreground",
  "text-gray-500": "text-muted-foreground",
  "text-gray-400": "text-muted-foreground",
  "text-gray-300": "text-primary-foreground",
  "text-gray-200": "text-primary-foreground",
  "text-gray-100": "text-primary-foreground",
  "text-gray-50": "text-primary-foreground",
  "text-black": "text-foreground",
  "text-white": "text-primary-foreground",
  "text-red-900": "text-destructive",
  "text-red-800": "text-destructive",
  "text-red-700": "text-destructive",
  "text-red-600": "text-destructive",
  "text-red-500": "text-destructive",
  "text-red-400": "text-destructive",
  "text-blue-900": "text-info",
  "text-blue-800": "text-info",
  "text-blue-700": "text-info",
  "text-blue-600": "text-info",
  "text-blue-500": "text-info",
  "text-blue-400": "text-info",
  "text-green-900": "text-success",
  "text-green-800": "text-success",
  "text-green-700": "text-success",
  "text-green-600": "text-success",
  "text-yellow-900": "text-warning",
  "text-yellow-800": "text-warning",
  "text-yellow-700": "text-warning",
  "text-yellow-600": "text-warning",
  "text-yellow-400": "text-warning",
  "text-orange-900": "text-warning",
  "text-orange-700": "text-warning",
  "text-orange-500": "text-warning",
  "text-orange-400": "text-warning",
  "text-orange-300": "text-warning",
  "text-amber-900": "text-warning",
};

const bg = {
  "bg-gray-100": "bg-muted",
  "bg-gray-200": "bg-secondary",
  "bg-gray-300": "bg-secondary",
  "bg-gray-400": "bg-muted",
  "bg-gray-500": "bg-muted-foreground",
  "bg-gray-600": "bg-muted-foreground",
  "bg-gray-700": "bg-muted-foreground",
  "bg-gray-800": "bg-primary",
  "bg-gray-900": "bg-primary",
  "bg-gray-900/50": "bg-primary/50",
  "bg-slate-50": "bg-card",
  "bg-slate-50/50": "bg-card/50",
  "bg-white": "bg-card",
  "bg-white/90": "bg-card/90",
  "bg-red-50": "bg-destructive/10",
  "bg-red-100": "bg-destructive/10",
  "bg-red-500": "bg-destructive",
  "bg-red-600": "bg-destructive",
  "bg-red-800": "bg-destructive",
  "bg-red-900": "bg-destructive",
  "bg-red-600/30": "bg-destructive/30",
  "bg-green-50": "bg-success/10",
  "bg-green-100": "bg-success/10",
  "bg-green-500": "bg-success",
  "bg-green-600": "bg-success",
  "bg-green-800": "bg-success",
  "bg-green-900": "bg-success",
  "bg-green-600/30": "bg-success/30",
  "bg-blue-50": "bg-info/10",
  "bg-blue-100": "bg-info/10",
  "bg-blue-200": "bg-info/20",
  "bg-blue-300": "bg-info/20",
  "bg-blue-500": "bg-info",
  "bg-blue-600": "bg-info",
  "bg-blue-800": "bg-info",
  "bg-blue-900": "bg-info",
  "bg-yellow-50": "bg-warning/10",
  "bg-yellow-100": "bg-warning/10",
  "bg-yellow-300": "bg-warning/20",
  "bg-yellow-400": "bg-warning",
  "bg-yellow-500": "bg-warning",
  "bg-yellow-600": "bg-warning",
  "bg-yellow-700": "bg-warning",
  "bg-amber-100": "bg-warning/10",
  "bg-amber-300": "bg-warning/20",
  "bg-orange-100": "bg-warning/10",
  "bg-orange-200": "bg-warning/20",
  "bg-orange-500": "bg-warning",
  "bg-orange-900": "bg-warning",
};

const border = {
  "border-gray-50": "border-border",
  "border-gray-100": "border-border",
  "border-gray-200": "border-border",
  "border-gray-300": "border-border",
  "border-gray-400": "border-border",
  "border-gray-500": "border-border",
  "border-gray-600": "border-border",
  "border-gray-700": "border-border",
  "border-gray-800": "border-border",
  "border-gray-900": "border-border",
  "border-slate-50": "border-border",
  "border-b-gray-300": "border-b-border",
  "border-red-300": "border-destructive",
  "border-red-700": "border-destructive",
  "border-red-800": "border-destructive",
  "border-red-900": "border-destructive",
  "border-blue-300": "border-info",
  "border-blue-400": "border-info",
  "border-blue-500": "border-info",
  "border-blue-600": "border-info",
  "border-blue-800": "border-info",
  "border-green-300": "border-success",
  "border-yellow-300": "border-warning",
  "border-yellow-400": "border-warning",
  "border-yellow-500": "border-warning",
  "border-orange-600": "border-warning",
  "border-amber-300": "border-warning",
};

const other = {
  "ring-blue-500": "ring-ring",
  "ring-gray-900": "ring-ring",
  "ring-gray-900/20": "ring-ring/20",
  "focus-visible:ring-gray-900": "focus-visible:ring-ring",
  "divide-gray-200": "divide-border",
  "fill-red-500": "fill-destructive",
  "scrollbar-thumb-gray-300": "scrollbar-thumb-border",
};

const outliers = {
  "even:bg-gray-50": "even:bg-muted",
  "focus:bg-gray-50": "focus:bg-muted",
  "disabled:bg-gray-50": "disabled:bg-muted",
  "after:bg-gray-50": "after:bg-card",
  "peer-hover:text-gray-900": "peer-hover:text-foreground",
  "peer-checked:bg-blue-900": "peer-checked:bg-info",
  "last-of-type:text-gray-800": "last-of-type:text-foreground",
  "group-hover/sidebar-resizer:bg-gray-500":
    "group-hover/sidebar-resizer:bg-muted-foreground",
  "group-hover:after:bg-gray-900": "group-hover:after:bg-foreground",
  "group-hover:placeholder:text-gray-700":
    "group-hover:placeholder:text-foreground",
  "group-focus-within:text-gray-900": "group-focus-within:text-foreground",
  "group-focus-within:placeholder:text-gray-700":
    "group-focus-within:placeholder:text-foreground",
  "data-disabled:text-gray-400": "data-disabled:text-muted-foreground",
  "data-[state=active]:text-gray-900": "data-[state=active]:text-foreground",
  "data-[state=active]:bg-gray-100": "data-[state=active]:bg-accent",
  "data-[selected=true]:bg-gray-100": "data-[selected=true]:bg-accent",
  "data-state:border-gray-700": "data-state:border-border",
  "data-[state=checked]:text-gray-50":
    "data-[state=checked]:text-primary-foreground",
  "data-[state=indeterminate]:text-gray-50":
    "data-[state=indeterminate]:text-primary-foreground",
  "data-[state=checked]:bg-gray-900": "data-[state=checked]:bg-primary",
  "data-[state=indeterminate]:bg-gray-900":
    "data-[state=indeterminate]:bg-primary",
  "data-[state=checked]:group-hover:bg-gray-900":
    "data-[state=checked]:group-hover:bg-primary",
  "data-[state=indeterminate]:group-hover:bg-gray-900":
    "data-[state=indeterminate]:group-hover:bg-primary",
  "disabled:data-[invalid=false]:data-[state=checked]:bg-gray-700":
    "disabled:data-[invalid=false]:data-[state=checked]:bg-muted-foreground",
  "disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-700":
    "disabled:data-[invalid=false]:data-[state=indeterminate]:bg-muted-foreground",
  "data-[invalid=true]:data-state:border-red-800":
    "data-[invalid=true]:data-state:border-destructive",
  "data-[invalid=true]:group-hover:border-red-900":
    "data-[invalid=true]:group-hover:border-destructive",
  "data-[invalid=true]:data-[state=checked]:bg-red-800":
    "data-[invalid=true]:data-[state=checked]:bg-destructive",
  "data-[invalid=true]:data-[state=indeterminate]:bg-red-800":
    "data-[invalid=true]:data-[state=indeterminate]:bg-destructive",
  "data-[invalid=true]:data-[state=checked]:group-hover:bg-red-900":
    "data-[invalid=true]:data-[state=checked]:group-hover:bg-destructive",
  "data-[invalid=true]:data-[state=indeterminate]:group-hover:bg-red-900":
    "data-[invalid=true]:data-[state=indeterminate]:group-hover:bg-destructive",
};

const base = { ...text, ...bg, ...border, ...other };
const bangPrefix = (o: Record<string, string>) =>
  pipe(
    o,
    mapKeys((c) => `!${c}`),
    mapValues((c) => `!${c}`),
  );
const bangSuffix = (o: Record<string, string>) =>
  pipe(
    o,
    mapKeys((c) => `${c}!`),
    mapValues((c) => `${c}!`),
  );

export const tokenMappings: Record<string, string> = {
  ...makeAncillaryClasses(base),
  ...makeAncillaryClasses(bangPrefix(base)),
  ...makeAncillaryClasses(bangSuffix(base)),
  ...outliers,
  ...bangSuffix(outliers),
};
