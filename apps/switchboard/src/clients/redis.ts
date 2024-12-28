import { createClient, RedisClientType } from "redis";

export let redisClient: RedisClientType;
// @TODO: fix eslint errors
export const initRedis = async () => {
  if (!redisClient) {
    const url = process.env.REDIS_TLS_URL ?? process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_TLS_URL is not set");
    }

    const socket = url.includes("rediss")
      ? {
          tls: true,
          rejectUnauthorized: false,
        }
      : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    redisClient = (await createClient({
      url,
      socket,
    })) as RedisClientType;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    redisClient.on("error", (err: string) =>
      console.log("Redis Client Error", err),
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    redisClient.connect();
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return redisClient;
};

const timer = setInterval(
  async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      redisClient && (await redisClient.ping());
    } catch (err) {
      console.error("Ping Interval Error", err);
    }
  },
  1000 * 60 * 4,
);

export const closeRedis = () => {
  clearInterval(timer);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  redisClient?.disconnect();
};
