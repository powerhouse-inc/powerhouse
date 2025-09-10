import type { RedisClientType } from "redis";
import { createClient } from "redis";

export let redisClient: RedisClientType | undefined;
export const initRedis = async (
  url: string,
): Promise<RedisClientType | undefined> => {
  if (redisClient) {
    return redisClient;
  }

  return new Promise((resolve, reject) => {
    const socket = url.includes("rediss")
      ? {
          tls: true,
          rejectUnauthorized: false,
        }
      : undefined;
    redisClient = createClient({
      url,
      socket,
    });

    redisClient
      .connect()
      .then((client) => {
        redisClient = client;

        client.on("error", (err) => {
          console.warn("Redis Client Error", err);
        });
        resolve(client);
      })
      .catch(async (e: unknown) => {
        reject(e instanceof Error ? e : new Error(JSON.stringify(e)));
        // await redisClient.disconnect();
        // console.warn("Redis Client Error", e);
      });
  });
};

const timer = setInterval(
  async () => {
    try {
      if (redisClient) {
        await redisClient.ping();
      }
    } catch (err) {
      console.error("Ping Interval Error", err);
    }
  },
  1000 * 60 * 4,
);

export const closeRedis = () => {
  clearInterval(timer);

  return redisClient?.disconnect();
};
