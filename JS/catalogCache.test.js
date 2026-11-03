import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidatePublicCatalogCache, loadPublicCatalog } from "./catalogCache.js";

describe("catalogCache", () => {
    const catalog = { works: [{ id: "work-1", title: "Naruto", chapters: [] }] };

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("reuses a valid local catalog without another request", async () => {
        const values = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        });
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => catalog
        });
        vi.stubGlobal("fetch", fetch);

        await expect(loadPublicCatalog()).resolves.toEqual(catalog);
        await expect(loadPublicCatalog()).resolves.toEqual(catalog);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent requests", async () => {
        const values = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        });
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => catalog
        });
        vi.stubGlobal("fetch", fetch);

        await expect(Promise.all([loadPublicCatalog(), loadPublicCatalog()]))
            .resolves.toEqual([catalog, catalog]);

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("refreshes an expired local catalog", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
        const values = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        });
        const fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => catalog
        });
        vi.stubGlobal("fetch", fetch);

        await loadPublicCatalog();
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);
        await loadPublicCatalog();

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("clears the local catalog after a successful catalog change", async () => {
        const values = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => catalog
        }));

        await loadPublicCatalog();
        invalidatePublicCatalogCache();

        expect(values.size).toBe(0);
    });

    it("does not store an outdated response after invalidation", async () => {
        const values = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (key) => values.get(key) || null,
            setItem: (key, value) => values.set(key, value),
            removeItem: (key) => values.delete(key)
        });
        let resolveResponse;
        vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
            resolveResponse = resolve;
        })));

        const pending = loadPublicCatalog();
        invalidatePublicCatalogCache();
        resolveResponse({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => catalog
        });
        await pending;

        expect(values.size).toBe(0);
    });
});
