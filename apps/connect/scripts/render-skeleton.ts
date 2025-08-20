import { dirname } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export async function renderSkeleton(module: string) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const AppSkeletonModule = await import(module);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const AppSkeleton = Object.values(AppSkeletonModule).at(0) as React.FC;
  const html = renderToStaticMarkup(createElement(AppSkeleton));
  const assetsPath = "file://" + dirname(dirname(module));
  return html.replaceAll(assetsPath, ".");
}
