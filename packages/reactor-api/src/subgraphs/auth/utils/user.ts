import { GraphQLError } from "graphql";
import { Db } from "../../../utils/db";

interface User {
  address: string;
  createdAt?: string;
  updatedAt?: string;
  networkId: string;
  chainId: number;
}
export const upsertUser = async (db: Db, user: User) => {
  const { AUTH_SIGNUP_DISABLED } = process.env;
  if (AUTH_SIGNUP_DISABLED) {
    throw new GraphQLError("Sign up is disabled");
  }

  const [existingUser] = await db<User>("User")
    .select()
    .where("address", user.address);

  if (existingUser) {
    return existingUser;
  }

  const date = new Date().toISOString();
  const [newUser] = await db<User>("User")
    .insert({
      address: user.address,
      updatedAt: date,
      createdAt: date,
    })
    .returning("*");

  return newUser;
};

export const getUser = async (db: Db, address: string) => {
  const [user] = await db<User>("User").select().where("address", address);
  return user;
};
