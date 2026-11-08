import { describe, expect, it } from "vitest";
import { getPostLoginDestination } from "./authRedirect.js";

const origin = "https://hokupedia.example";
const loginPath = "/HTML/CadLog.html";
const previousPage = `${origin}/HTML/Obra.html?obra=work-1`;

describe("getPostLoginDestination", () => {
    it("sends administrators to work management by default", () => {
        expect(getPostLoginDestination(
            { email: "HOKUPEDIA@gmail.com" },
            null,
            previousPage,
            loginPath,
            origin
        )).toBe("/HTML/GerenciarObras.html");
    });

    it.each([
        { labels: ["moderator"] },
        { labels: ["user"] }
    ])("returns non-admin users to the page before login", (user) => {
        expect(getPostLoginDestination(
            user,
            null,
            previousPage,
            loginPath,
            origin
        )).toBe("/HTML/Obra.html?obra=work-1");
    });

    it("does not allow a non-admin to be redirected to work management", () => {
        expect(getPostLoginDestination(
            { labels: ["moderator"] },
            "/HTML/GerenciarObras.html?obra=work-1",
            previousPage,
            loginPath,
            origin
        )).toBe("/HTML/Obra.html?obra=work-1");
    });

    it("ignores external requested destinations", () => {
        expect(getPostLoginDestination(
            {},
            "https://attacker.example",
            previousPage,
            loginPath,
            origin
        )).toBe("/HTML/Obra.html?obra=work-1");
    });
});
