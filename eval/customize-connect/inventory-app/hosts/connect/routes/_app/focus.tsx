import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/focus")({
  staticData: { sidebar: "hidden" },
  component: () => (
    <div className="p-6" data-testid="focus-page">
      No sidebar here.
    </div>
  ),
});
