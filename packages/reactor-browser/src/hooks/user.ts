import { makePHEventFunctions } from "@powerhousedao/reactor-browser";
import { useAllowList } from "./config.js";

export const {
  useValue: useLoginStatus,
  setValue: setLoginStatus,
  addEventHandler: addLoginStatusEventHandler,
} = makePHEventFunctions("loginStatus");

export const {
  useValue: useUser,
  setValue: setUser,
  addEventHandler: addUserEventHandler,
} = makePHEventFunctions("user");

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
