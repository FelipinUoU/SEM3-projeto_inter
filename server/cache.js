const MAX_CACHE_ENTRIES = 20;
const cacheEntries = new Map();
const inFlightLoads = new Map();
let cacheGeneration = 0;

export function getCachedValue(key, ttlMs, loader) {
  const cached = cacheEntries.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }
  if (cached) cacheEntries.delete(key);

  const inFlight = inFlightLoads.get(key);
  if (inFlight) return inFlight;

  const generation = cacheGeneration;
  const load = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (generation === cacheGeneration) {
        cacheEntries.set(key, { value, expiresAt: Date.now() + ttlMs });
        while (cacheEntries.size > MAX_CACHE_ENTRIES) {
          cacheEntries.delete(cacheEntries.keys().next().value);
        }
      }
      return value;
    })
    .finally(() => {
      if (inFlightLoads.get(key) === load) inFlightLoads.delete(key);
    });
  inFlightLoads.set(key, load);
  return load;
}

export function invalidateCache(prefix = '') {
  cacheGeneration += 1;
  inFlightLoads.clear();
  for (const key of cacheEntries.keys()) {
    if (key.startsWith(prefix)) cacheEntries.delete(key);
  }
}

export function clearCache() {
  cacheGeneration += 1;
  cacheEntries.clear();
  inFlightLoads.clear();
}
