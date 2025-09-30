const cacheMiddleware = (key, expiration = 3600) => {
  return async (req, res, next) => {
    try {
      if (!global.redisClient || !global.redisClient.isReady) {
        return next();
      }

      const cacheKey = typeof key === "function" ? key(req) : key;
      const cachedData = await global.redisClient.get(cacheKey);

      if (cachedData) {
        console.log(`Cache hit for key: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      const originalJson = res.json;
      res.json = async function (data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            await global.redisClient.setEx(
              cacheKey,
              expiration,
              JSON.stringify(data)
            );
            console.log(`Data cached for key: ${cacheKey}`);
          } catch (e) {
            console.warn("Cache set failed:", e.message);
          }
        }
        originalJson.call(this, data);
      };
      next();
    } catch (error) {
      console.error("Redis cache middleware error:", error);
      next(); // Continue without caching if there's an error
    }
  };
};

const invalidateCache = async (key) => {
  try {
    if (global.redisClient && global.redisClient.isReady) {
      const deleted = await global.redisClient.del(key);
      if (deleted > 0) {
        console.log(`Cache invalidated for key: ${key}`);
      } else {
        console.log(`Cache key not found for invalidation: ${key}`);
      }
    } else {
      console.warn("Redis client not initialized. Cannot invalidate cache.");
    }
  } catch (error) {
    console.error("Error invalidating cache:", error);
  }
};

module.exports = { cacheMiddleware, invalidateCache };