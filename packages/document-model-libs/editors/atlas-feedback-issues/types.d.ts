interface WindowEventMap {
  CREATE_ISSUE: CustomEvent<{ notionIds: string[] }>;
  ADD_NOTION_ID_TO_ISSUE: CustomEvent<{ notionId: string; phid: string }>;
  REMOVE_NOTION_ID_FROM_ISSUE: CustomEvent<{ notionId: string; phid: string }>;
}
