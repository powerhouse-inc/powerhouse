export const eventNames = {
  CREATE_ISSUE: "CREATE_ISSUE",
  ADD_NOTION_ID_TO_ISSUE: "ADD_NOTION_ID_TO_ISSUE",
  REMOVE_NOTION_ID_FROM_ISSUE: "REMOVE_NOTION_ID_FROM_ISSUE",
} as const;

export type CreateIssueEvent = CustomEvent<{ notionIds: string[] }>;
export type AddNotionIdToIssueEvent = CustomEvent<{
  notionId: string;
  phid: string;
}>;
export type RemoveNotionIdFromIssueEvent = CustomEvent<{
  notionId: string;
  phid: string;
}>;

export function dispatchCreateIssueEvent(notionIds: string[]) {
  const event: CreateIssueEvent = new CustomEvent(eventNames.CREATE_ISSUE, {
    detail: {
      notionIds,
    },
  });
  window.dispatchEvent(event);
}

export function dispatchAddNotionIdToIssueEvent(
  notionId: string,
  phid: string,
) {
  const event: AddNotionIdToIssueEvent = new CustomEvent(
    eventNames.ADD_NOTION_ID_TO_ISSUE,
    {
      detail: {
        notionId,
        phid,
      },
    },
  );
  window.dispatchEvent(event);
}

export function dispatchRemoveNotionIdFromIssueEvent(
  notionId: string,
  phid: string,
) {
  const event: RemoveNotionIdFromIssueEvent = new CustomEvent(
    eventNames.REMOVE_NOTION_ID_FROM_ISSUE,
    {
      detail: {
        notionId,
        phid,
      },
    },
  );
  window.dispatchEvent(event);
}
