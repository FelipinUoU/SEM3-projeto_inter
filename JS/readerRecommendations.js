import { getWorkTags } from "./recommendations.js";

function getChapterLanguage(chapter) {
    return chapter.language || "pt-BR";
}

function compareChapterOrder(left, right) {
    return left.chapter.number - right.chapter.number
        || Date.parse(left.chapter.createdAt || "") - Date.parse(right.chapter.createdAt || "")
        || left.index - right.index;
}

export function getAdjacentChapters(work, currentChapter) {
    if (!Array.isArray(work?.chapters) || !currentChapter) {
        return { previous: null, next: null };
    }

    const matchingChapters = work.chapters
        .map((chapter, index) => ({ chapter, index }))
        .filter(({ chapter }) => getChapterLanguage(chapter) === getChapterLanguage(currentChapter))
        .sort(compareChapterOrder);
    const previous = matchingChapters
        .filter(({ chapter }) => chapter.number < currentChapter.number)
        .at(-1)?.chapter || null;
    const next = matchingChapters.find(({ chapter }) => chapter.number > currentChapter.number)?.chapter || null;

    return {
        previous,
        next
    };
}

export function getNextLanguageAlternatives(work, currentChapter) {
    if (!Array.isArray(work?.chapters) || !currentChapter) return [];

    const nextNumber = work.chapters
        .filter((chapter) => chapter.number > currentChapter.number
            && getChapterLanguage(chapter) !== getChapterLanguage(currentChapter))
        .reduce((lowest, chapter) => Math.min(lowest, chapter.number), Infinity);
    if (!Number.isFinite(nextNumber)) return [];

    return work.chapters
        .map((chapter, index) => ({ chapter, index }))
        .filter(({ chapter }) => chapter.number === nextNumber
            && getChapterLanguage(chapter) !== getChapterLanguage(currentChapter))
        .sort((left, right) => getChapterLanguage(left.chapter)
            .localeCompare(getChapterLanguage(right.chapter))
            || compareChapterOrder(left, right))
        .map(({ chapter }) => chapter);
}

export function getChapterLanguageName(language) {
    return ({
        "pt-BR": "Português (Brasil)",
        ja: "Japonês",
        en: "Inglês",
        es: "Espanhol",
        fr: "Francês",
        ko: "Coreano"
    })[language] || language || "Português (Brasil)";
}

export function buildRelatedWorks(works, currentWork, limit = 6) {
    const currentTags = new Set(getWorkTags(currentWork).map(({ key }) => key));
    if (currentTags.size === 0) return [];

    return works
        .filter((work) => work.id !== currentWork.id)
        .map((work, index) => {
            const matchedTags = getWorkTags(work)
                .filter(({ key }) => currentTags.has(key))
                .map(({ label }) => label);
            return { work, matchedTags, score: matchedTags.length, index };
        })
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score
            || left.work.title.localeCompare(right.work.title, "pt-BR")
            || left.index - right.index)
        .slice(0, limit);
}
