import type { LoginStatus } from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "@powerhousedao/reactor-browser";
import type { User } from "@renown/sdk";
import { useAllowList } from "./config.js";

export const {
  useValue: useLoginStatus,
  setValue: setLoginStatus,
  addEventHandler: addLoginStatusEventHandler,
} = makePHEventFunctions<LoginStatus>("loginStatus");

export const {
  useValue: useUser,
  setValue: setUser,
  addEventHandler: addUserEventHandler,
} = makePHEventFunctions<User>("user");

export function useUserPermissions() {
  const user = useUser();
  const allowList = useAllowList();
  if (!allowList) {
    return {
      isAllowedToCreateDocuments: true,
      isAllowedToEditDocuments: true,
    };
  }

  return {
    isAllowedToCreateDocuments: allowList.includes(user?.address ?? ""),
    isAllowedToEditDocuments: allowList.includes(user?.address ?? ""),
  };
}
