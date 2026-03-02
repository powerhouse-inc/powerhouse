import { AnalyticsPath } from "./AnalyticsPath.js";
import type { AnalyticsUpdateCallback } from "./IAnalyticsStore.js";

export class NotificationError extends Error {
  public readonly innerErrors: Error[];

  constructor(errors: Error[]) {
    super(errors.map((e) => e.message).join("\n"));

    this.name = "NotificationError";
    this.innerErrors = errors;
  }
}

/**
 * Manages subscriptions for analytics paths.
 */
export class AnalyticsSubscriptionManager {
  private _subscriptions: Map<string, Set<AnalyticsUpdateCallback>> = new Map();

  /**
   * Subscribe to updates for an analytics path. A subscribed function will be
   * called for:
   *
   * - exact path matches
   * - matching child paths (i.e. an update to /a/b/c will trigger a callback
   *   for /a/b/c, /a/b, and /a)
   * - wildcard matches
   *
   * @param path The analytics path to subscribe to.
   * @param callback Function to be called when the path is updated.
   *
   * @returns A function that, when called, unsubscribes from the updates.
   */
  public subscribeToPath(
    path: AnalyticsPath,
    callback: AnalyticsUpdateCallback,
  ): () => void {
    const pathString = this.normalizePath(path.toString("/"));

    if (!this._subscriptions.has(pathString)) {
      this._subscriptions.set(pathString, new Set());
    }

    this._subscriptions.get(pathString)!.add(callback);

    return () => {
      const callbacks = this._subscriptions.get(pathString);
      if (callbacks) {
        callbacks.delete(callback);

        // only remove the path entry if there are no more callbacks
        if (callbacks.size === 0) {
          this._subscriptions.delete(pathString);
        }
      }
    };
  }

  /**
   * Notifies subscribers about updates to paths.
   *
   * @param paths The paths that were updated.
   */
  public notifySubscribers(paths: AnalyticsPath[]): void {
    if (paths.length === 0 || this._subscriptions.size === 0) {
      return;
    }

    const errors: Error[] = [];
    for (const path of paths) {
      const pathString = this.normalizePath(path.toString("/"));
      const pathPrefixes = this.getPathPrefixes(pathString);

      const matchingSubscriptions: Array<{
        prefix: string;
        callbacks: Set<AnalyticsUpdateCallback>;
      }> = [];

      // add the exact prefix matches
      pathPrefixes
        .filter((prefix) => this._subscriptions.has(prefix))
        .forEach((prefix) => {
          matchingSubscriptions.push({
            prefix,
            callbacks: this._subscriptions.get(prefix)!,
          });
        });

      // check all wildcard patterns
      for (const [
        subscriptionPath,
        callbacks,
      ] of this._subscriptions.entries()) {
        // skip if it's already in the exact matches
        if (pathPrefixes.includes(subscriptionPath)) {
          continue;
        }

        // hceck if this subscription path (which might have wildcards) matches the update path
        if (this.pathMatchesWildcardPattern(pathString, subscriptionPath)) {
          matchingSubscriptions.push({
            prefix: subscriptionPath,
            callbacks,
          });
        }
      }

      if (matchingSubscriptions.length === 0) continue;

      // guarantee delivery to all subscribers
      for (const { callbacks } of matchingSubscriptions) {
        for (const callback of callbacks) {
          try {
            callback(path);
          } catch (e) {
            errors.push(e as Error);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new NotificationError(errors);
    }
  }

  /**
   * Normalizes a path string to ensure consistent comparison.
   */
  private normalizePath(path: string): string {
    // Handle potential double slashes by first splitting on slashes and rejoining
    const parts = path.split("/").filter((p) => p.length > 0);
    const normalized = "/" + parts.join("/");
    return normalized;
  }

  /**
   * Checks if a path matches a subscription pattern that may contain wildcards.
   */
  private pathMatchesWildcardPattern(
    updatePath: string,
    subscriptionPath: string,
  ): boolean {
    // Handle the wildcard segment case
    if (subscriptionPath.includes("*")) {
      const updateSegments = updatePath.split("/").filter((s) => s.length > 0);
      const subscriptionSegments = subscriptionPath
        .split("/")
        .filter((s) => s.length > 0);

      // If subscription is longer than the update path, it can't match
      if (subscriptionSegments.length > updateSegments.length) {
        return false;
      }

      // Compare each segment
      for (let i = 0; i < subscriptionSegments.length; i++) {
        const subSegment = subscriptionSegments[i];
        const updateSegment = updateSegments[i];

        // If segment is * or starts with * (wildcard), it matches anything
        if (subSegment === "*" || subSegment.startsWith("*:")) {
          continue;
        }

        // Otherwise, segments should match exactly
        if (subSegment !== updateSegment) {
          return false;
        }
      }

      return true;
    }

    // If no wildcards, check if subscription is a prefix of the update path
    return (
      updatePath === subscriptionPath ||
      updatePath.startsWith(subscriptionPath + "/")
    );
  }

  /**
   * Gets all path prefixes for a given path.
   *
   * For example, for '/a/b/c' it returns ['/a', '/a/b', '/a/b/c'].
   */
  private getPathPrefixes(path: string): string[] {
    const segments = path.split("/").filter((s) => s.length > 0);
    const prefixes: string[] = [];

    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : `/${segment}`;
      prefixes.push(currentPath);
    }

    if (prefixes.length === 0 && path === "/") {
      prefixes.push("/");
    }

    return prefixes;
  }
}
