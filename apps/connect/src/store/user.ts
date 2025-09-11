import { useUser } from "@powerhousedao/reactor-browser";
import type { User as SentryUser } from "@sentry/react";
import { setUser as setSentryUser } from "@sentry/react";
import { useEffect } from "react";

export function useSetSentryUser() {
  const user = useUser();
  useEffect(() => {
    let sentryUser: SentryUser | null = null;
    if (user) {
      // saves the user info except the credential
      const { credential, ...rest } = user;
      sentryUser = { id: rest.did, username: rest.ens?.name, ...rest };
    }
    setSentryUser(sentryUser);
  }, [user]);
}
