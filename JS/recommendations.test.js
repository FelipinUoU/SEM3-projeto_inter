import { describe, expect, it } from "vitest";
import { buildRecommendations, getWorkTags } from "./recommendations.js";

const works = [
    { id: "read", gender: "Ação, Fantasia" },
    { id: "favorite", gender: "Fantasia, Aventura" },
    { id: "best-match", gender: "fantasia, Ação" },
    { id: "other-match", gender: "Aventura" },
    { id: "unrelated", gender: "Drama" }
];

describe("buildRecommendations", () => {
    it("recommends unread works by tags from history and favorites", () => {
        const recommendations = buildRecommendations(works, {
            readingHistory: [{ workId: "read" }],
            favorites: ["favorite"]
        });

        expect(recommendations.map(({ work }) => work.id)).toEqual([
            "best-match",
            "other-match"
        ]);
        expect(recommendations[0].matchedTags).toEqual(["fantasia", "Ação"]);
    });

    it("does not produce recommendations until at least one work was read", () => {
        expect(buildRecommendations(works, {
            readingHistory: [],
            favorites: ["favorite"]
        })).toEqual([]);
    });

    it("normalizes accent and whitespace differences in tags", () => {
        expect(getWorkTags({ gender: "  Ação ; Ficção   científica " }).map(({ key }) => key))
            .toEqual(["acao", "ficcao cientifica"]);
    });
});
