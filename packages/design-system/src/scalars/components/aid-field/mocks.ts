import type { AIDOption, Network } from "./types.js";

export const mockedOptions: AIDOption[] = [
  {
    icon: "Person",
    title: "Agent A",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent A description",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Agent B",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent B description",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Agent C",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8a",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x89:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    description: "Agent C description",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Lucas Martinez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8b",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8b",
    description: "UX Designer",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Oliver Brown",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8c",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8c",
    description: "DevOps Engineer",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Isabella Garcia",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8d",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8d",
    description: "Frontend Developer",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "William Taylor",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8e",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8e",
    description: "Backend Developer",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Ava Johnson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e8f",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e8f",
    description: "Quality Assurance Engineer",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Noah Anderson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9a",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9a",
    description: "Systems Architect",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Mia Patel",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9b",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e9b",
    description: "Security Analyst",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Ethan Wright",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9c",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9c",
    description: "Cloud Engineer",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Charlotte Lee",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9d",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9d",
    description: "Project Manager",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Alexander Kim",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9e",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936e9e",
    description: "Machine Learning Engineer",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Sofia Rodriguez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936e9f",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e9f",
    description: "Full Stack Developer",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Daniel Smith",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaa",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eaa",
    description: "Mobile Developer",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Victoria White",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eab",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eab",
    description: "Business Analyst",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Henry Davis",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eac",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eac",
    description: "Technical Lead",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Zoe Miller",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ead",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ead",
    description: "UI Designer",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Benjamin Clark",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eae",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eae",
    description: "Infrastructure Engineer",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Lily Zhang",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eaf",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936eaf",
    description: "Software Developer",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Sebastian Moore",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936eba",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936eba",
    description: "Database Administrator",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Aria Thomas",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebb",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ebb",
    description: "Product Designer",
    agentType: "Human Contributor",
  },
  {
    icon: "Person",
    title: "Jack Wilson",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebc",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936ebc",
    description: "Solutions Architect",
    agentType: "Contributor Team",
  },
  {
    icon: "Person",
    title: "Luna Harris",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebd",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936ebd",
    description: "Network Engineer",
    agentType: "AI Contributor",
  },
  {
    icon: "Person",
    title: "Owen Martinez",
    path: {
      text: "renown.id/0xb9c5714089478a327f09197987f16f9e5d936ebe",
      url: "https://www.renown.id/",
    },
    value: "did:ethr:0x5:0xb9c5714089478a327f09197987f16f9e5d936ebe",
    description: "Security Engineer",
    agentType: "Human Contributor",
  },
];

const filterOptions = (
  options: AIDOption[],
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
): Promise<AIDOption[]> => {
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
): Promise<AIDOption | undefined> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.value === value);
};

// Sync versions
export const fetchOptionsSync = (
  userInput: string,
  context?: Record<string, unknown>,
): AIDOption[] => {
  return filterOptions(mockedOptions, userInput, context);
};

export const fetchSelectedOptionSync = (
  value: string,
): AIDOption | undefined => {
  return mockedOptions.find((option) => option.value === value);
};
