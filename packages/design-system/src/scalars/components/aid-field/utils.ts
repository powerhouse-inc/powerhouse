import { IdAutocompleteOption } from "@/scalars/components/fragments/id-autocomplete-field/types";

export const mockedOptions: IdAutocompleteOption[] = [
  {
    icon: "Person",
    title: "Agent A",
    path: "agents/agent-a",
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent A description",
  },
  {
    icon: "Person",
    title: "Agent B",
    path: "agents/agent-b",
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent B description",
  },
  {
    icon: "Person",
    title: "Agent C",
    path: "agents/agent-c",
    value: "did:ethr:0x89:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent C description",
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
