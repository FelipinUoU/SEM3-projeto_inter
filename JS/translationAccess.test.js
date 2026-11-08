import { describe, expect, it } from "vitest";
import {
    getTranslationLoginMessage,
    shouldRequireLoginForTranslation
} from "./translationAccess.js";

describe("translation access guard", () => {
    it("requires login when there is no authenticated user", () => {
        expect(getTranslationLoginMessage(null)).toBe("Faça login para traduzir páginas.");
        expect(shouldRequireLoginForTranslation(null)).toBe(true);
    });

    it("allows translation for authenticated users", () => {
        const user = { $id: "user-1" };
        expect(getTranslationLoginMessage(user)).toBeNull();
        expect(shouldRequireLoginForTranslation(user)).toBe(false);
    });
});
