import { IdAutocompleteOption } from "@/scalars/components/fragments/id-autocomplete-field/types";

export const mockedOptions: IdAutocompleteOption[] = [
  {
    icon: "PowerhouseLogoSmall",
    title: "Document A",
    path: "projects/finance/document-a",
    value: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc7dea7:main:public",
    description: "Financial report for Q1 2024",
  },
  {
    icon: "PowerhouseLogoSmall",
    title: "Document B",
    path: "projects/legal/document-b",
    value: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8:main:public",
    description: "Legal compliance documentation",
  },
  {
    icon: "PowerhouseLogoSmall",
    title: "Document C",
    path: "projects/operations/document-c",
    value: "phd:baefc2a4-f9a0-4950-8161-fd8d8cc5efc9:main:public",
    description: "Operational guidelines and procedures",
  },
];

// Async versions
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

// Sync versions
export const fetchOptionsSync = (): IdAutocompleteOption[] => {
  return mockedOptions;
};

export const fetchSelectedOptionSync = (
  value: string,
): IdAutocompleteOption | undefined => {
  return mockedOptions.find((option) => option.value === value);
};
