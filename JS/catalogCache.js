const CACHE_KEY = "hokupedia.publicCatalog.v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
let inFlightLoad;
let cacheGeneration = 0;

function isValidCatalog(data) {
    return Array.isArray(data?.works)
        && data.works.every((work) => work
            && typeof work.id === "string"
            && typeof work.title === "string");
}

function readCatalogCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (cached?.savedAt > Date.now() - CACHE_TTL_MS && isValidCatalog(cached.data)) {
            return cached.data;
        }
        if (cached) localStorage.removeItem(CACHE_KEY);
    } catch (error) {
        console.warn("Não foi possível ler o cache local do catálogo:", error);
    }
    return undefined;
}

export function loadPublicCatalog() {
    const cachedData = readCatalogCache();
    if (cachedData) return Promise.resolve(cachedData);
    if (inFlightLoad) return inFlightLoad;

    const generation = cacheGeneration;
    const load = (async () => {
        const response = await fetch("/api/catalog/works");
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await response.json() : null;
        if (!response.ok) {
            throw new Error(data?.error || `Não foi possível carregar as obras (HTTP ${response.status}).`);
        }
        if (!isValidCatalog(data)) {
            throw new Error("A resposta do catálogo contém uma lista de obras inválida.");
        }

        if (generation === cacheGeneration) {
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
            } catch (error) {
                console.warn("Não foi possível salvar o cache local do catálogo:", error);
            }
        }
        return data;
    })();

    const wrappedLoad = load.finally(() => {
        if (inFlightLoad === wrappedLoad) inFlightLoad = undefined;
    });
    inFlightLoad = wrappedLoad;
    return wrappedLoad;
}

export function invalidatePublicCatalogCache() {
    cacheGeneration += 1;
    inFlightLoad = undefined;
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch (error) {
        console.warn("Não foi possível limpar o cache local do catálogo:", error);
    }
}
