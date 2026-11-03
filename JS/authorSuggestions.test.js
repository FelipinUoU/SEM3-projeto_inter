import { describe, expect, it } from "vitest";
import { findSimilarAuthorSuggestions, getAuthorSimilarityScore } from "./authorSuggestions.js";

describe("authorSuggestions", () => {
    const sampleWorks = [
        { id: "work-1", title: "Naruto", author: "Masashi Kishimoto" },
        { id: "work-2", title: "Samurai 8", author: "Masashi Kishimoto" },
        { id: "work-3", title: "One Piece", author: "Eiichiro Oda" },
        { id: "work-4", title: "Chainsaw Man", author: "Tatsuki Fujimoto" }
    ];

    it("encontra autores com nome parcial ou parecido (erro de digitação) e agrupa suas obras", () => {
        const partial = findSimilarAuthorSuggestions("Kishimot", sampleWorks);
        expect(partial).toHaveLength(1);
        expect(partial[0].author).toBe("Masashi Kishimoto");
        expect(partial[0].works).toEqual(["Naruto", "Samurai 8"]);
        expect(partial[0].isExactMatch).toBe(false);

        const typo = findSimilarAuthorSuggestions("Masashi Kichimoto", sampleWorks);
        expect(typo[0]?.author).toBe("Masashi Kishimoto");
        expect(typo[0]?.works).toEqual(["Naruto", "Samurai 8"]);
    });

    it("identifica quando o nome digitado já é exatamente igual ao autor cadastrado", () => {
        const exact = findSimilarAuthorSuggestions("Eiichiro Oda", sampleWorks);
        expect(exact).toHaveLength(1);
        expect(exact[0].author).toBe("Eiichiro Oda");
        expect(exact[0].isExactMatch).toBe(true);
        expect(exact[0].works).toEqual(["One Piece"]);
    });

    it("ignora a obra atual ao editar e não sugere autores sem semelhança", () => {
        const excluded = findSimilarAuthorSuggestions("Eiichiro Oda", sampleWorks, {
            excludeWorkId: "work-3"
        });
        expect(excluded).toEqual([]);

        expect(getAuthorSimilarityScore("Kentaro Miura", "Eiichiro Oda")).toBe(0);
    });
});
