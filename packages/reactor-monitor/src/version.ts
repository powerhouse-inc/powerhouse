/**
 * Bumped when the shape of this package's exports changes in a breaking way.
 * Also the default `appBuildId` a worker reactor's version fingerprint pins
 * to, which is why it lives in its own module: the worker entry reads it too.
 */
export const ReactorMonitorVersion = "0.2.0" as const;
