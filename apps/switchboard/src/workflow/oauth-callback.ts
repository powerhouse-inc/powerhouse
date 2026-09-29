import type { WorkflowRuntimeService } from "@powerhousedao/reactor-workflow";
import type {
  IHttpScope,
  ScopedRouteHandle,
} from "@powerhousedao/shared/processors";

export const OAUTH_CALLBACK_PATH = "oauth/callback";

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

// The popup's last page. The editor that opened it polls the attempt, so this
// only has to say how it went; closing itself is a courtesy.
function resultPage(ok: boolean, detail: string | null): string {
  const title = ok ? "Connected" : "Sign-in failed";
  const message = ok
    ? "You can close this window."
    : escapeHtml(detail ?? "The sign-in did not finish.");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:15px system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#222}main{max-width:28rem;padding:1.5rem;text-align:center}h1{font-size:1.1rem}</style>
</head><body><main><h1>${title}</h1><p>${message}</p></main>
${ok ? "<script>setTimeout(function(){window.close()},600)</script>" : ""}
</body></html>`;
}

// The provider's redirect lands here. Public: the provider sends no bearer,
// and the one-time state is what the runtime checks instead.
export function registerOAuthCallback(
  http: IHttpScope,
  runtime: Pick<WorkflowRuntimeService, "completeOAuth">,
): ScopedRouteHandle {
  return http.get(OAUTH_CALLBACK_PATH, { auth: "public" }, async (request) => {
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    const result = state
      ? await runtime.completeOAuth({
          state,
          code: params.get("code") ?? undefined,
          error: params.get("error") ?? undefined,
          errorDescription: params.get("error_description") ?? undefined,
        })
      : { ok: false, detail: "The provider sent no state", returnUrl: null };
    if (result.returnUrl && state) {
      const back = new URL(result.returnUrl);
      back.searchParams.set("ph_oauth", state);
      return new Response(null, {
        status: 303,
        headers: { location: back.href, "cache-control": "no-store" },
      });
    }
    return new Response(resultPage(result.ok, result.detail), {
      status: result.ok ? 200 : 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  });
}

export function callbackUrlOf(http: IHttpScope): string {
  return `${http.baseUrl.replace(/\/+$/, "")}/${OAUTH_CALLBACK_PATH}`;
}
