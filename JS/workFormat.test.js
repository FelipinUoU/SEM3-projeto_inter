import { describe, expect, it } from "vitest";
import { normalizeWorkFormat } from "./workFormat.js";

describe("normalizeWorkFormat", () => {
    it.each([
        ["HQ's", "hq"],
        ["Quadrinhos", "hq"],
        ["Manhwas", "manhwa"],
        ["Mangás", "manga"],
        ["formato desconhecido", ""]
    ])("normalizes %s", (value, expected) => {
        expect(normalizeWorkFormat(value)).toBe(expected);
    });
});
