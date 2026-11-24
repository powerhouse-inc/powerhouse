import { FileQuestion, RotateCw, Unplug } from "lucide-react";
import type { DevtoolsApiFailureCode } from "../api-client.js";
import { EmptyState, Mono } from "../kit.js";
import { Button } from "../ui/button.js";

export function ReloadButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="ph-reload"
      onClick={() => window.location.reload()}
    >
      <RotateCw />
      Reload the page
    </Button>
  );
}

/** A whole page's answer to a request the DevTools API did not serve: what
 * happened, in the page's words, and the way out of it. */
export function ApiUnavailable({
  code,
  message,
  ...data
}: {
  code: DevtoolsApiFailureCode;
  message: string;
} & { [k: `data-${string}`]: string | undefined }) {
  const reason = <span data-slot="api-message">{message}</span>;
  if (code === "bad_token") {
    return (
      <EmptyState
        {...data}
        data-code={code}
        icon={RotateCw}
        tone="warn"
        role="alert"
        title="The dev server restarted"
        reason={reason}
        action={
          <div className="flex justify-center">
            <ReloadButton />
          </div>
        }
      >
        This page was served before the restart, and the server no longer
        accepts what it sends. Reload it to connect again.
      </EmptyState>
    );
  }
  if (code === "no_token") {
    return (
      <EmptyState
        {...data}
        data-code={code}
        icon={Unplug}
        role="alert"
        title="This page has no dev server behind it"
      >
        DevTools reads the project through the <Mono>ph</Mono> dev server. Open
        the app that <Mono>ph vetra</Mono> or <Mono>ph connect</Mono> serves on{" "}
        <Mono>localhost</Mono>.
      </EmptyState>
    );
  }
  if (code === "unreachable") {
    return (
      <EmptyState
        {...data}
        data-code={code}
        icon={Unplug}
        tone="warn"
        role="alert"
        title="The dev server is not answering"
        reason={reason}
      >
        Start it again with <Mono>ph vetra</Mono> or <Mono>ph connect</Mono>.
        DevTools keeps trying and shows the project as soon as it answers.
      </EmptyState>
    );
  }
  if (code === "bad_host" || code === "bad_origin") {
    return (
      <EmptyState
        {...data}
        data-code={code}
        icon={Unplug}
        tone="warn"
        role="alert"
        title="DevTools answers on localhost only"
        reason={reason}
      >
        This page reached the dev server through another address, a proxy or a
        tunnel. Open the app at <Mono>localhost</Mono> on this machine.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      {...data}
      data-code={code}
      icon={FileQuestion}
      tone="error"
      role="alert"
      title="The DevTools API answered with an error"
      reason={reason}
    >
      DevTools keeps trying every few seconds.
    </EmptyState>
  );
}
