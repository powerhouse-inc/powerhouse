import { createClient, type RedisClientType } from "redis";

export let redisClient: RedisClientType;
export const initRedis = async () => {
  if (!redisClient) {
    const url = process.env.REDIS_TLS_URL ?? process.env.REDIS_URL;
    if (!url) {
      return;
    }

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

    redisClient.on("error", (err: string) => {
      console.log("Redis Client Error", err);
      throw new Error("Redis Client Error");
    });

    redisClient.connect();
  }

  return redisClient;
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

  redisClient.disconnect();
};
