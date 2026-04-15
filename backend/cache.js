const cache = new Map();
const TEN_MINUTES_MS = 10 * 60 * 1000;

export const getCacheKey = (query) =>
  JSON.stringify({
    location: query.location?.toLowerCase().trim(),
    checkin: query.checkin,
    checkout: query.checkout,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    currency: query.currency
  });

export const getCachedResult = (key) => {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cached.value;
};

export const setCachedResult = (key, value) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + TEN_MINUTES_MS
  });
};
