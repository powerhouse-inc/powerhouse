export const featureFlags = {
  allowCustomDirectories: process.env.ALLOW_CUSTOM_DIRECTORIES === "true",
} as const;
