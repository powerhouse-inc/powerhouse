import { RENOWN_SESSION_COOKIE, verifyRenownSession } from "@renown/sdk/node";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/documents"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Auth gate: verifies the session cookie's JWT signature + expiry (no network —
// no switchboard/revocation check). The page/DAL remains the authoritative check.
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(RENOWN_SESSION_COOKIE)?.value;
  const session = cookie
    ? await verifyRenownSession(cookie, { verifyCredential: false })
    : undefined;
  const authed = !!session;

  const { pathname } = request.nextUrl;

  // Unauthenticated visitors can only see the login screen and the reactor
  // client demo, which is meant to run both anonymously and signed in.
  if (!authed && !isPublicPath(pathname)) {
    const login = new URL("/login", request.url);
    // A redirect sign-in returning to a protected path carries the DID in
    // `?user=`; keep it, or the login page never sees the sign-in.
    const user = request.nextUrl.searchParams.get("user");
    if (user) login.searchParams.set("user", user);
    return NextResponse.redirect(login);
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
