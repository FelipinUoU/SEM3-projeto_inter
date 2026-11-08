import { beforeEach, describe, expect, it } from "vitest";
import {
    addFavorite,
    completePendingFavorite,
    loadUserLibrary,
    queueFavoriteAfterLogin
} from "./userLibrary.js";

function createStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

describe("pending favorites", () => {
    beforeEach(() => {
        globalThis.localStorage = createStorage();
        globalThis.sessionStorage = createStorage();
    });

    it("adds a queued favorite after login and consumes the request", () => {
        queueFavoriteAfterLogin("work-1");

        expect(completePendingFavorite("user-1")).toBe("work-1");
        expect(loadUserLibrary("user-1").favorites).toEqual(["work-1"]);
        expect(completePendingFavorite("user-1")).toBeNull();
    });

    it("does not add the same favorite twice", () => {
        addFavorite("user-1", "work-1");
        queueFavoriteAfterLogin("work-1");

        expect(completePendingFavorite("user-1")).toBe("work-1");
        expect(loadUserLibrary("user-1").favorites).toEqual(["work-1"]);
    });
});
