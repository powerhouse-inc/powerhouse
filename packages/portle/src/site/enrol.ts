import type { EnrollmentResponse } from "./types.js";

/**
 * Enrols this site with the Portle control plane: one token, one site. The
 * token is single use; the answer is the site's identity and every secret the
 * tunnel and the certificate need, and is stored once by the caller.
 */
export async function enrolWithControlPlane(
  controlPlaneUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EnrollmentResponse> {
  const url = `${controlPlaneUrl.replace(/\/$/, "")}/v1/enroll`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status !== 201) {
    throw new Error(
      `enrolment failed: HTTP ${res.status} ${text.slice(0, 300)}`,
    );
  }
  const data = JSON.parse(text) as Partial<EnrollmentResponse>;
  if (
    !data.siteId ||
    !data.siteSecret ||
    !data.frp?.token ||
    !data.dns?.tsigSecret
  ) {
    throw new Error("enrolment response is incomplete");
  }
  return data as EnrollmentResponse;
}
