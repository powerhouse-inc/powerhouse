import { RENOWN_SESSION_COOKIE, verifyRenownSession } from "@renown/sdk/node";
import { NextResponse, type NextRequest } from "next/server";

// Auth gate: verifies the session cookie's JWT signature + expiry (no network —
// no switchboard/revocation check). The page/DAL remains the authoritative check.
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(RENOWN_SESSION_COOKIE)?.value;
  const session = cookie
    ? await verifyRenownSession(cookie, { verifyCredential: false })
    : undefined;
  const authed = !!session;

  const { pathname } = request.nextUrl;

  // Unauthenticated visitors can only see the login screen.
  if (!authed && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Already signed in? Skip the login screen.
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Run on pages only — skip API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
