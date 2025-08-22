import { dirname } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export async function renderSkeleton(module: string) {
  const AppSkeletonModule = await import(module);
  const AppSkeleton = Object.values(AppSkeletonModule).at(0) as React.FC;
  const html = renderToStaticMarkup(createElement(AppSkeleton));
  const assetsPath = "file://" + dirname(dirname(module));
  return html.replaceAll(assetsPath, ".");
}
