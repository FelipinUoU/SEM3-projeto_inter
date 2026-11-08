import { describe, expect, it } from "vitest";
import { groupChaptersByNumber } from "./chapterGroups.js";

describe("groupChaptersByNumber", () => {
    it("groups translations and alternate versions under the same chapter number", () => {
        const chapters = [
            { id: "pt-a", number: 1, language: "pt-BR" },
            { id: "en", number: 1, language: "en" },
            { id: "pt-b", number: 1, language: "pt-BR", createBy: "translator-2" },
            { id: "two", number: 2, language: "pt-BR" }
        ];

        expect([...groupChaptersByNumber(chapters)].map(([number, versions]) => [
            number,
            versions.map(({ chapter }) => chapter.id)
        ])).toEqual([
            [1, ["pt-a", "en", "pt-b"]],
            [2, ["two"]]
        ]);
    });

    it("uses the position for chapters with missing or invalid numbers", () => {
        const chapters = [{ id: "one", number: 1 }, { id: "legacy" }];

        expect([...groupChaptersByNumber(chapters).keys()]).toEqual([1, 2]);
    });
});
