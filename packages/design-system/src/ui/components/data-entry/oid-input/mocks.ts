import type { OIDOption } from "./types.js";

export const mockedOptions: OIDOption[] = [
  {
    icon: "Braces",
    title: "Object A",
    path: {
      text: "rwa-portfolio-a",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc7dea7",
    description: "Object A description",
  },
  {
    icon: "Braces",
    title: "Object B",
    path: {
      text: "rwa-portfolio-b",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc6cdb8",
    description: "Object B description",
  },
  {
    icon: "Braces",
    title: "Object C",
    path: {
      text: "rwa-portfolio-c",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc5efc9",
    description: "Object C description",
  },
  {
    icon: "Braces",
    title: "Object D",
    path: {
      text: "rwa-portfolio-d",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc1cfe3",
    description: "Object D description",
  },
  {
    icon: "Braces",
    title: "Object E",
    path: {
      text: "rwa-portfolio-e",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc0bfe4",
    description: "Object E description",
  },
  {
    icon: "Braces",
    title: "Object F",
    path: {
      text: "rwa-portfolio-f",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc9aef5",
    description: "Object F description",
  },
  {
    icon: "Braces",
    title: "Object G",
    path: {
      text: "rwa-portfolio-g",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc8aef6",
    description: "Object G description",
  },
  {
    icon: "Braces",
    title: "Object H",
    path: {
      text: "rwa-portfolio-h",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc7aef7",
    description: "Object H description",
  },
  {
    icon: "Braces",
    title: "Object I",
    path: {
      text: "rwa-portfolio-i",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc6aef8",
    description: "Object I description",
  },
  {
    icon: "Braces",
    title: "Object J",
    path: {
      text: "rwa-portfolio-j",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc5aef9",
    description: "Object J description",
  },
  {
    icon: "Braces",
    title: "Object K",
    path: {
      text: "rwa-portfolio-k",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc4aea0",
    description: "Object K description",
  },
  {
    icon: "Braces",
    title: "Object L",
    path: {
      text: "rwa-portfolio-l",
    },
    value: "baefc2a4-f9a0-4950-8161-fd8d8cc3aea1",
    description: "Object L description",
  },
];

const filterOptions = (options: OIDOption[], userInput: string) => {
  const normalizedInput = userInput.toLowerCase();

  return options.filter((opt) => {
    return (
      opt.title?.toLowerCase().includes(normalizedInput) ||
      opt.path?.text.toLowerCase().includes(normalizedInput) ||
      opt.value.toLowerCase().includes(normalizedInput) ||
      opt.description?.toLowerCase().includes(normalizedInput)
    );
  });
};

// Async versions
export const fetchOptions = async (userInput: string): Promise<OIDOption[]> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Add 20% chance of error
  if (Math.random() < 0.2) {
    throw new Error();
  }

  return filterOptions(mockedOptions, userInput);
};

export const fetchSelectedOption = async (
  value: string,
): Promise<OIDOption | undefined> => {
  // Simulate 2s network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return mockedOptions.find((option) => option.value === value);
};

// Sync versions
export const fetchOptionsSync = (userInput: string): OIDOption[] => {
  return filterOptions(mockedOptions, userInput);
};

export const fetchSelectedOptionSync = (
  value: string,
): OIDOption | undefined => {
  return mockedOptions.find((option) => option.value === value);
};
