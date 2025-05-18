import type { PyroscopeConfig } from "@pyroscope/nodejs";

export async function initProfilerFromEnv(env: typeof process.env) {
  const {
    PYROSCOPE_SERVER_ADDRESS: serverAddress,
    PYROSCOPE_APPLICATION_NAME: appName,
    PYROSCOPE_USER: basicAuthUser,
    PYROSCOPE_PASSWORD: basicAuthPassword,
  } = env;

  const options: PyroscopeConfig = {
    serverAddress,
    appName,
    basicAuthUser,
    basicAuthPassword,
  };
  return initProfiler(options);
}

export async function initProfiler(options?: PyroscopeConfig) {
  console.log("Initializing Pyroscope profiler at:", options?.serverAddress);
  const Pyroscope = await import("@pyroscope/nodejs");
  Pyroscope.init(options);
  Pyroscope.start();
}
