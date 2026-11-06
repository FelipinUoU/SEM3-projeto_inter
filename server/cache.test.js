import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache, getCachedValue, invalidateCache } from "./cache.js";

describe("server cache", () => {
    afterEach(() => {
        clearCache();
        vi.useRealTimers();
    });

    it("reuses values until their TTL expires", async () => {
        vi.useFakeTimers();
        const loader = vi.fn().mockResolvedValue("catalog");

        await expect(getCachedValue("works:catalog", 1000, loader)).resolves.toBe("catalog");
        await expect(getCachedValue("works:catalog", 1000, loader)).resolves.toBe("catalog");
        expect(loader).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1001);
        await getCachedValue("works:catalog", 1000, loader);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent loads", async () => {
        let resolveLoad;
        const loader = vi.fn(() => new Promise((resolve) => {
            resolveLoad = resolve;
        }));

        const first = getCachedValue("works:catalog", 1000, loader);
        const second = getCachedValue("works:catalog", 1000, loader);
        await Promise.resolve();
        resolveLoad("catalog");

        await expect(Promise.all([first, second])).resolves.toEqual(["catalog", "catalog"]);
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it("does not cache an in-flight result after invalidation", async () => {
        let resolveLoad;
        const loader = vi.fn()
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveLoad = resolve;
            }))
            .mockResolvedValueOnce("fresh");

        const pending = getCachedValue("works:catalog", 1000, loader);
        await Promise.resolve();
        invalidateCache("works:");
        resolveLoad("stale");

        await expect(pending).resolves.toBe("stale");
        await expect(getCachedValue("works:catalog", 1000, loader)).resolves.toBe("fresh");
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it("does not retain rejected loads", async () => {
        const loader = vi.fn()
            .mockRejectedValueOnce(new Error("temporary failure"))
            .mockResolvedValueOnce("catalog");

        await expect(getCachedValue("works:catalog", 1000, loader))
            .rejects.toThrow("temporary failure");
        await expect(getCachedValue("works:catalog", 1000, loader)).resolves.toBe("catalog");
        expect(loader).toHaveBeenCalledTimes(2);
    });
});
