function normalizeTag(tag) {
    return tag
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim()
        .replace(/\s+/g, " ");
}

export function getWorkTags(work) {
    const value = work.gender ?? work.Gender ?? work.genres ?? work.Genres ?? work.genre ?? work.Genre ?? [];
    const values = Array.isArray(value) ? value : String(value).split(/[,;]/);
    const seen = new Set();
    return values
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((label) => ({ label, key: normalizeTag(label) }))
        .filter((tag) => {
            if (!tag.key || seen.has(tag.key)) return false;
            seen.add(tag.key);
            return true;
        });
}

export function buildRecommendations(works, library) {
    if (!Array.isArray(library?.readingHistory) || library.readingHistory.length === 0) return [];

    const sourceIds = new Set([
        ...library.readingHistory.map((entry) => entry.workId),
        ...(Array.isArray(library.favorites) ? library.favorites : [])
    ]);
    const worksById = new Map(works.map((work) => [work.id, work]));
    const tagScores = new Map();

    for (const workId of sourceIds) {
        const work = worksById.get(workId);
        if (!work) continue;
        for (const tag of getWorkTags(work)) {
            const score = tagScores.get(tag.key) || { count: 0 };
            score.count += 1;
            tagScores.set(tag.key, score);
        }
    }

    return works
        .map((work, index) => {
            if (sourceIds.has(work.id)) return null;
            const matchedTags = getWorkTags(work)
                .filter((tag) => tagScores.has(tag.key))
                .map((tag) => tag.label);
            const score = matchedTags.reduce(
                (total, tag) => total + tagScores.get(normalizeTag(tag)).count,
                0
            );
            return score > 0 ? { work, matchedTags, score, index } : null;
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.index - right.index);
}
