import { PHIDProps, PHIDListItemProps } from "./types";

interface FetchPHIDOptionsParams {
  phidFragment: string; // input value
  defaultBranch: PHIDProps["defaultBranch"];
  defaultScope: PHIDProps["defaultScope"];
  allowedScopes: PHIDProps["allowedScopes"];
  allowedDocumentTypes: PHIDProps["allowedDocumentTypes"];
  signal?: AbortSignal;
}

interface FetchSelectedOptionParams {
  phid: string; // full phid of the selected option
  signal?: AbortSignal;
}

export const mockedOptions: PHIDListItemProps[] = [
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

export const fetchPHIDOptions = async ({
  phidFragment,
  defaultBranch,
  defaultScope,
  allowedScopes,
  allowedDocumentTypes,
  signal,
}: FetchPHIDOptionsParams): Promise<PHIDListItemProps[]> => {
  // TODO: Implement actual API call
  // Example implementation:
  // const params = new URLSearchParams({
  //   phidFragment,
  //   allowedScopes: JSON.stringify(allowedScopes),
  //   allowedDocumentTypes: JSON.stringify(allowedDocumentTypes),
  // });
  // if URLSearchParams is to long, maybe a POST request will be better
  // const response = await fetch(`/api/phid/search?${params}`, { signal });
  // return response.json();

  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions;
};

export const fetchSelectedOption = async ({
  phid,
  signal,
}: FetchSelectedOptionParams): Promise<PHIDListItemProps | undefined> => {
  // TODO: Implement actual API call
  // Example implementation:
  // const response = await fetch(`/api/phid/${phid}`, { signal });
  // return response.json();

  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.phid === phid);
};
