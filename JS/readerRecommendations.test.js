import { describe, expect, it } from "vitest";
import {
    buildRelatedWorks,
    getAdjacentChapters,
    getNextLanguageAlternatives
} from "./readerRecommendations.js";

describe("getAdjacentChapters", () => {
    const chapters = [
        { id: "one", number: 1, language: "pt-BR", createBy: "translator-a" },
        { id: "one-en", number: 1, language: "en", createBy: "translator-a" },
        { id: "two-other-translator", number: 2, language: "pt-BR", createBy: "translator-b" },
        { id: "two", number: 2, language: "pt-BR", createBy: "translator-a" },
        { id: "three", number: 3, language: "pt-BR", createBy: "translator-a" }
    ];
    const work = { chapters };

    it("finds previous and next chapters in the same language across different publishers", () => {
        expect(getAdjacentChapters(work, chapters[3])).toEqual({
            previous: chapters[0],
            next: chapters[4]
        });
    });

    it("returns no same-language neighbor when a chapter is first or last", () => {
        expect(getAdjacentChapters(work, chapters[0]).previous).toBeNull();
        expect(getAdjacentChapters(work, chapters[4]).next).toBeNull();
    });

    it("offers the nearest later chapter versions in other languages", () => {
        const current = { id: "current", number: 1, language: "pt-BR" };
        const alternatives = [
            { id: "next-en", number: 2, language: "en" },
            { id: "next-es", number: 2, language: "es" },
            { id: "later-ja", number: 3, language: "ja" }
        ];
        expect(getNextLanguageAlternatives({ chapters: [current, ...alternatives] }, current))
            .toEqual(alternatives.slice(0, 2));
    });

    it("does not offer chapters in the current language as a language fallback", () => {
        const current = { id: "current", number: 1, language: "pt-BR" };
        expect(getNextLanguageAlternatives({
            chapters: [current, { id: "next", number: 2, language: "pt-BR" }]
        }, current)).toEqual([]);
    });
});

describe("buildRelatedWorks", () => {
    const currentWork = { id: "current", gender: "Ação, Fantasia" };
    const works = [
        currentWork,
        { id: "one-match", title: "Uma", gender: "Ação" },
        { id: "two-matches", title: "Duas", gender: "Fantasia, Ação" },
        { id: "unrelated", title: "Drama", gender: "Drama" }
    ];

    it("returns other works with shared categories, ordered by match count", () => {
        expect(buildRelatedWorks(works, currentWork).map(({ work }) => work.id))
            .toEqual(["two-matches", "one-match"]);
    });
});
