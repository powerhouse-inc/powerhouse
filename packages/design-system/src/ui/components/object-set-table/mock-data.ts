export interface MockedPerson {
  firstName: string;
  walletAddress: string;
  payment: number;
  email: string;
  status: "active" | "inactive";
  address: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
  };
}

export const mockData: MockedPerson[] = [
  {
    firstName: "John",
    walletAddress: "0x1234567890abcdef",
    payment: 100,
    email: "john@example.com",
    status: "active",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Jane",
    walletAddress: "0x1234567890abcdef",
    payment: 1065460,
    email: "jane@example.com",
    status: "inactive",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Jim",
    walletAddress: "0x1234567890abcdef",
    payment: 14522,
    email: "jim@example.com",
    status: "active",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Jill",
    walletAddress: "0x1234567890abcdef",
    payment: 11231200,
    email: "jill@example.com",
    status: "inactive",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Jack",
    walletAddress: "0x1234567890abcdef",
    payment: 10234234230,
    email: "jack@example.com",
    status: "active",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Jill",
    walletAddress: "0x1234567890abcdef",
    payment: 0,
    email: "jill@example.com",
    status: "inactive",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
  {
    firstName: "Mike",
    walletAddress: "0x1234567890abcdef",
    payment: 15,
    email: "mike@example.com",
    status: "inactive",
    address: {
      addressLine1: "123 Main St",
      addressLine2: "Apt 1",
      city: "Anytown",
      state: "CA",
      zip: "12345",
    },
  },
];
