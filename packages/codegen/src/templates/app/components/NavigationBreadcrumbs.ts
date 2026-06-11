import { tsx } from "@tmpl/core";

export const driveExplorerNavigationBreadcrumbsFileTemplate = () =>
  tsx`import { Breadcrumbs } from "@powerhousedao/design-system/connect"; /** Shows the navigation breadcrumbs for selected drive or folder */ export function NavigationBreadcrumbs() return ( <div className="border-b border-gray-300 pb-3 space-y-3"> <Breadcrumbs /> </div> );`.raw;
