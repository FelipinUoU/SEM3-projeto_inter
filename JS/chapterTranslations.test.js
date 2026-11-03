import { describe, expect, it, vi } from "vitest";
import {
    getStoredChapterTranslations,
    getStoredPageAnalysis,
    removeStoredPageAnalysis,
    savePageAnalysis,
    saveTranslatedPage
} from "./chapterTranslations.js";

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
}

describe("chapter translation persistence", () => {
    it("stores translated pages by language and preserves existing chapter translations", () => {
        const storage = createStorage({
            chapter: JSON.stringify({
                "Português brasileiro": { "page-1": [{ translation: "Olá" }] },
                English: { "page-2": [{ translation: "Hello" }] }
            })
        });

        const saved = saveTranslatedPage(storage, "chapter", "Português brasileiro", "page-3", [
            { translation: "Tudo bem?" }
        ]);
        const record = getStoredChapterTranslations(storage, "chapter");

        expect(saved).toBe(true);
        expect(record["Português brasileiro"]["page-1"]).toEqual([{ translation: "Olá" }]);
        expect(record["Português brasileiro"]["page-3"]).toEqual([{ translation: "Tudo bem?" }]);
        expect(record.English["page-2"]).toEqual([{ translation: "Hello" }]);
    });

    it("returns an empty record when a chapter has no saved translations", () => {
        expect(getStoredChapterTranslations(createStorage(), "chapter")).toEqual({});
    });

    it("reports invalid stored data instead of overwriting it", () => {
        const storage = createStorage({ chapter: "[]" });
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        expect(saveTranslatedPage(storage, "chapter", "Português brasileiro", "page-1", [])).toBe(false);
        expect(storage.getItem("chapter")).toBe("[]");
        expect(errorSpy).toHaveBeenCalledOnce();

        errorSpy.mockRestore();
    });

    it("restores a completed analysis only when the page image still matches", () => {
        const storage = createStorage();
        const analysis = {
            detectedLanguage: "French",
            bubbles: [{ id: 1, originalText: "Bonjour", x: 10, y: 20, width: 30, height: 40 }]
        };

        expect(savePageAnalysis(storage, "chapter-analysis", "page-1", "image-hash", analysis)).toBe(true);
        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-1", "image-hash")).toEqual(analysis);
        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-1", "updated-image-hash")).toBeNull();
    });

    it("preserves analyses for other pages in the chapter", () => {
        const storage = createStorage();
        const analysis = { detectedLanguage: "French", bubbles: [] };

        savePageAnalysis(storage, "chapter-analysis", "page-1", "image-1", analysis);
        savePageAnalysis(storage, "chapter-analysis", "page-2", "image-2", analysis);

        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-1", "image-1")).toEqual(analysis);
        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-2", "image-2")).toEqual(analysis);
    });

    it("removes a completed page analysis without deleting other pages", () => {
        const storage = createStorage();
        const analysis = { detectedLanguage: "French", bubbles: [] };
        savePageAnalysis(storage, "chapter-analysis", "page-1", "image-1", analysis);
        savePageAnalysis(storage, "chapter-analysis", "page-2", "image-2", analysis);

        expect(removeStoredPageAnalysis(storage, "chapter-analysis", "page-1")).toBe(true);
        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-1", "image-1")).toBeNull();
        expect(getStoredPageAnalysis(storage, "chapter-analysis", "page-2", "image-2")).toEqual(analysis);
    });
});
