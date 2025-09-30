const redis = require("redis");

let warnedOnce = false;

const redisClient = redis.createClient({
  url: process.env.REDIS_URL, // default redis://localhost:6379 if undefined
  socket: {
    // Quiet exponential backoff: 1s, 2s, ... capped at 30s
    reconnectStrategy: (retries) => Math.min(30000, (retries || 1) * 1000),
  },
});

redisClient.on("connect", () => console.log("Redis Client Connected"));
redisClient.on("ready", () => {
  warnedOnce = false; // reset warnings after a successful connect
  console.log("Redis Client Ready");
});
redisClient.on("end", () => console.log("Redis Client Disconnected"));
// Keep errors quiet unless the client was already ready, or first failure
redisClient.on("error", (err) => {
  if (redisClient.isReady) {
    console.warn("Redis Client Error after ready:", err.message);
  } else if (!warnedOnce) {
    warnedOnce = true;
    console.warn("Redis not available, retrying quietly with backoff...");
  }
});

async function connectRedis() {
  try {
    if (!redisClient.isReady) {
      // Initiate connection; with reconnectStrategy it will keep retrying in background
      await redisClient.connect();
    }
  } catch (_err) {
    // Swallow initial connect error; background retries will continue
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn("Redis connect failed, will retry quietly with backoff...");
    }
  }
}
module.exports = { redisClient, connectRedis };
