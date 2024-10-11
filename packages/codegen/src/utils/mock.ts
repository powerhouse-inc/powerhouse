import { generateMock as zodGenerateMock } from "@anatine/zod-mock";
export type generateMockTypeFn = typeof zodGenerateMock;

export const generateMock: generateMockTypeFn = (zodRef, options) => {
  return zodGenerateMock(zodRef, options) as generateMockTypeFn;
};
