import { PHIDListItemProps } from "./types";

interface FetchPHIDOptionsParams {
  delay?: number;
}

export const fetchPHIDOptions = async ({
  delay = 2000,
}: FetchPHIDOptionsParams = {}): Promise<PHIDListItemProps[]> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, delay));

  const options: PHIDListItemProps[] = [
    {
      title: "Document A",
      path: "projects/finance/document-a",
      phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc7dea7",
      description: "Financial report for Q1 2024",
    },
    {
      title: "Document B",
      path: "projects/legal/document-b",
      phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8",
      description: "Legal compliance documentation",
    },
    {
      title: "Document C",
      path: "projects/operations/document-c",
      phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc5efc9",
      description: "Operational guidelines and procedures",
    },
  ];

  return options;
};
