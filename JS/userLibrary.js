import { account } from "./JAVA/appwriteClient.js";

const libraryStoragePrefix = "hokupedia.userLibrary.v1.";
const anonymousReadChaptersKey = "hokupedia.readChapters.v1";

function isReadEntry(entry) {
    return entry && typeof entry.workId === "string"
        && typeof entry.chapterId === "string"
        && Number.isFinite(entry.readAt);
}

function loadStoredArray(key, isValidItem, description) {
    const stored = localStorage.getItem(key);
    if (stored === null) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((item) => !isValidItem(item))) {
        throw new Error(`Os dados locais de ${description} estão inválidos.`);
    }
    return parsed;
}

export async function getCurrentLibraryUser() {
    try {
        return await account.get();
    } catch (error) {
        if (error.code === 401) return null;
        throw error;
    }
}

export function loadUserLibrary(userId) {
    if (typeof userId !== "string" || !userId) {
        throw new Error("Não foi possível identificar a conta da biblioteca.");
    }

    const key = `${libraryStoragePrefix}${userId}`;
    const stored = localStorage.getItem(key);
    if (stored === null) {
        return { readChapters: [], readingHistory: [], favorites: [] };
    }

    const library = JSON.parse(stored);
    if (!library || !Array.isArray(library.readChapters)
        || library.readChapters.some((chapter) => typeof chapter !== "string")
        || !Array.isArray(library.readingHistory)
        || library.readingHistory.some((entry) => !isReadEntry(entry))
        || !Array.isArray(library.favorites)
        || library.favorites.some((workId) => typeof workId !== "string")) {
        throw new Error("Os dados locais da biblioteca estão inválidos.");
    }
    return library;
}

function saveUserLibrary(userId, library) {
    localStorage.setItem(`${libraryStoragePrefix}${userId}`, JSON.stringify(library));
}

export function loadAnonymousReadChapters() {
    return loadStoredArray(
        anonymousReadChaptersKey,
        (chapter) => typeof chapter === "string",
        "histórico de leitura"
    );
}

export function recordReadChapter(userId, workId, chapterId) {
    const chapterKey = `${workId}:${chapterId}`;
    if (!userId) {
        const chapters = loadAnonymousReadChapters();
        if (!chapters.includes(chapterKey)) {
            chapters.push(chapterKey);
            localStorage.setItem(anonymousReadChaptersKey, JSON.stringify(chapters));
        }
        return;
    }

    const library = loadUserLibrary(userId);
    if (!library.readChapters.includes(chapterKey)) {
        library.readChapters.push(chapterKey);
    }
    library.readingHistory = library.readingHistory.filter((entry) => entry.workId !== workId);
    library.readingHistory.push({ workId, chapterId, readAt: Date.now() });
    saveUserLibrary(userId, library);
}

export function toggleFavorite(userId, workId) {
    const library = loadUserLibrary(userId);
    const isFavorite = library.favorites.includes(workId);
    library.favorites = isFavorite
        ? library.favorites.filter((favoriteId) => favoriteId !== workId)
        : [...library.favorites, workId];
    saveUserLibrary(userId, library);
    return !isFavorite;
}
