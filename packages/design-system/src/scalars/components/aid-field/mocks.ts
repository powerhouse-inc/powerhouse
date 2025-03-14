import type { IdAutocompleteOption } from "../fragments/id-autocomplete-field/types.js";
import type { Network } from "./types.js";

export const mockedOptions: IdAutocompleteOption[] = [
  {
    icon: "Person",
    title: "Agent A",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent A description",
  },
  {
    icon: "Person",
    title: "Agent B",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent B description",
  },
  {
    icon: "Person",
    title: "Agent C",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
    },
    value: "did:ethr:0x89:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent C description",
  },
  {
    icon: "Person",
    title: "Lucas Martinez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8b",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8b",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8b",
    description: "UX Designer",
  },
  {
    icon: "Person",
    title: "Oliver Brown",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8c",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8c",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8c",
    description: "DevOps Engineer",
  },
  {
    icon: "Person",
    title: "Isabella Garcia",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8d",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8d",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8d",
    description: "Frontend Developer",
  },
  {
    icon: "Person",
    title: "William Taylor",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8e",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8e",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8e",
    description: "Backend Developer",
  },
  {
    icon: "Person",
    title: "Ava Johnson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8f",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8f",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8f",
    description: "Quality Assurance Engineer",
  },
  {
    icon: "Person",
    title: "Noah Anderson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9a",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9a",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9a",
    description: "Systems Architect",
  },
  {
    icon: "Person",
    title: "Mia Patel",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9b",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9b",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e9b",
    description: "Security Analyst",
  },
  {
    icon: "Person",
    title: "Ethan Wright",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9c",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9c",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9c",
    description: "Cloud Engineer",
  },
  {
    icon: "Person",
    title: "Charlotte Lee",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9d",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9d",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9d",
    description: "Project Manager",
  },
  {
    icon: "Person",
    title: "Alexander Kim",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9e",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9e",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e9e",
    description: "Machine Learning Engineer",
  },
  {
    icon: "Person",
    title: "Sofia Rodriguez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9f",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9f",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9f",
    description: "Full Stack Developer",
  },
  {
    icon: "Person",
    title: "Daniel Smith",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaa",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaa",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eaa",
    description: "Mobile Developer",
  },
  {
    icon: "Person",
    title: "Victoria White",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eab",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eab",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eab",
    description: "Business Analyst",
  },
  {
    icon: "Person",
    title: "Henry Davis",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eac",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eac",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eac",
    description: "Technical Lead",
  },
  {
    icon: "Person",
    title: "Zoe Miller",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ead",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936ead",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ead",
    description: "UI Designer",
  },
  {
    icon: "Person",
    title: "Benjamin Clark",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eae",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eae",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eae",
    description: "Infrastructure Engineer",
  },
  {
    icon: "Person",
    title: "Lily Zhang",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaf",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaf",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eaf",
    description: "Software Developer",
  },
  {
    icon: "Person",
    title: "Sebastian Moore",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eba",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936eba",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eba",
    description: "Database Administrator",
  },
  {
    icon: "Person",
    title: "Aria Thomas",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebb",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebb",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ebb",
    description: "Product Designer",
  },
  {
    icon: "Person",
    title: "Jack Wilson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebc",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebc",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936ebc",
    description: "Solutions Architect",
  },
  {
    icon: "Person",
    title: "Luna Harris",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebd",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebd",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ebd",
    description: "Network Engineer",
  },
  {
    icon: "Person",
    title: "Owen Martinez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebe",
      url: "https://www.renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebe",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936ebe",
    description: "Security Engineer",
  },
];

const filterOptions = (
  options: IdAutocompleteOption[],
  userInput: string,
  context?: Record<string, unknown>,
) => {
  const normalizedInput = userInput.toLowerCase();
  const supportedNetworks = Array.isArray(context?.supportedNetworks)
    ? (context.supportedNetworks as Network[])
    : [];

  return options.filter((opt) => {
    if (supportedNetworks.length > 0) {
      const chainId = opt.value.split(":")[2];
      if (!supportedNetworks.some((network) => network.chainId === chainId)) {
        return false;
      }
    }

    return (
      opt.title?.toLowerCase().includes(normalizedInput) ||
      opt.path?.text.toLowerCase().includes(normalizedInput) ||
      opt.value.toLowerCase().includes(normalizedInput) ||
      opt.description?.toLowerCase().includes(normalizedInput)
    );
  });
};

// Async versions
export const fetchOptions = async (
  userInput: string,
  context?: Record<string, unknown>,
): Promise<IdAutocompleteOption[]> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Add 20% chance of error
  if (Math.random() < 0.2) {
    throw new Error();
  }

  return filterOptions(mockedOptions, userInput, context);
};

export const fetchSelectedOption = async (
  value: string,
): Promise<IdAutocompleteOption | undefined> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.value === value);
};

// Sync versions
export const fetchOptionsSync = (
  userInput: string,
  context?: Record<string, unknown>,
): IdAutocompleteOption[] => {
  return filterOptions(mockedOptions, userInput, context);
};

export const fetchSelectedOptionSync = (
  value: string,
): IdAutocompleteOption | undefined => {
  return mockedOptions.find((option) => option.value === value);
};
