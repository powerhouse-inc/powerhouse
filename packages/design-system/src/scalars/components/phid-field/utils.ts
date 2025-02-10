import { PHIDItem } from "./types";

export const mockedOptions: PHIDItem[] = [
  {
    title: "Document A",
    path: "projects/finance/document-a",
    phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc7dea7:main:public",
    description: "Financial report for Q1 2024",
  },
  {
    title: "Document B",
    path: "projects/legal/document-b",
    phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8:main:public",
    description: "Legal compliance documentation",
  },
  {
    title: "Document C",
    path: "projects/operations/document-c",
    phid: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc5efc9:main:public",
    description: "Operational guidelines and procedures",
  },
];

export const fetchOptions = async (): Promise<PHIDItem[]> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Add 30% chance of error
  if (Math.random() < 0.3) {
    throw new Error();
  }

  return mockedOptions;
};

export const fetchSelectedOption = async (
  phid: string,
): Promise<PHIDItem | undefined> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.phid === phid);
};
