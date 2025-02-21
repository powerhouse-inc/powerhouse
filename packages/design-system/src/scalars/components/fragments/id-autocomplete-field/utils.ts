import { IdAutocompleteOption } from "./types";

export const mockedOptions: IdAutocompleteOption[] = [
  {
    icon: "PowerhouseLogoSmall",
    title: "Document A",
    path: "projects/finance/document-a",
    value: "document-a",
    description: "Financial report for Q1 2024",
  },
  {
    icon: "PowerhouseLogoSmall",
    title: "Document B",
    path: "projects/legal/document-b",
    value: "document-b",
    description: "Legal compliance documentation",
  },
  {
    icon: "PowerhouseLogoSmall",
    title: "Document C",
    path: "projects/operations/document-c",
    value: "document-c",
    description: "Operational guidelines and procedures",
  },
];

export const fetchOptions = async (): Promise<IdAutocompleteOption[]> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Add 30% chance of error
  if (Math.random() < 0.3) {
    throw new Error();
  }

  return mockedOptions;
};

export const fetchSelectedOption = async (
  value: string,
): Promise<IdAutocompleteOption | undefined> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.value === value);
};
