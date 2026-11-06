export function normalizeAuthorName(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function getLevenshteinDistance(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = new Array(right.length + 1);

    for (let i = 0; i < left.length; i += 1) {
        current[0] = i + 1;
        for (let j = 0; j < right.length; j += 1) {
            const cost = left[i] === right[j] ? 0 : 1;
            current[j + 1] = Math.min(
                current[j] + 1,
                previous[j + 1] + 1,
                previous[j] + cost
            );
        }
        for (let j = 0; j <= right.length; j += 1) {
            previous[j] = current[j];
        }
    }

    return previous[right.length];
}

function getStringSimilarity(left, right) {
    const maxLength = Math.max(left.length, right.length);
    if (maxLength === 0) return 1;
    return 1 - getLevenshteinDistance(left, right) / maxLength;
}

export function getAuthorSimilarityScore(rawQuery, rawCandidate) {
    const query = normalizeAuthorName(rawQuery);
    const candidate = normalizeAuthorName(rawCandidate);

    if (query.length < 2 || !candidate) return 0;
    if (query === candidate) return 1;
    if (candidate.startsWith(query) || query.startsWith(candidate)) return 0.95;
    if (candidate.includes(query) || query.includes(candidate)) return 0.9;

    let bestScore = 0;
    const fullDistance = getLevenshteinDistance(query, candidate);
    const fullSimilarity = getStringSimilarity(query, candidate);
    if ((query.length >= 4 && fullDistance <= 2) || fullSimilarity >= 0.65) {
        bestScore = Math.max(bestScore, fullSimilarity);
    }

    const queryTokens = query.split(" ").filter((token) => token.length >= 2);
    const candidateTokens = candidate.split(" ").filter((token) => token.length >= 2);

    for (const queryToken of queryTokens) {
        for (const candidateToken of candidateTokens) {
            if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) {
                bestScore = Math.max(bestScore, 0.88);
                continue;
            }
            if (queryToken.length < 3 || candidateToken.length < 3) continue;
            const tokenDistance = getLevenshteinDistance(queryToken, candidateToken);
            const tokenSimilarity = getStringSimilarity(queryToken, candidateToken);
            if (
                (queryToken.length >= 4 && tokenDistance <= 1)
                || (queryToken.length >= 5 && tokenDistance <= 2)
                || tokenSimilarity >= 0.72
            ) {
                bestScore = Math.max(bestScore, 0.82 * tokenSimilarity);
            }
        }
    }

    return bestScore;
}

export function findSimilarAuthorSuggestions(query, worksList = [], options = {}) {
    const { excludeWorkId = "", limit = 5 } = options;
    const trimmedQuery = String(query || "").trim();
    const normalizedQuery = normalizeAuthorName(trimmedQuery);
    if (normalizedQuery.length < 2) return [];

    const authorsByNormalizedName = new Map();
    for (const item of worksList) {
        if (!item || (excludeWorkId && item.id === excludeWorkId)) continue;
        const author = typeof item.author === "string" ? item.author.trim() : "";
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const normalizedAuthor = normalizeAuthorName(author);
        if (!normalizedAuthor) continue;

        let entry = authorsByNormalizedName.get(normalizedAuthor);
        if (!entry) {
            entry = {
                author,
                normalizedAuthor,
                works: []
            };
            authorsByNormalizedName.set(normalizedAuthor, entry);
        }
        if (title && !entry.works.some((existing) => normalizeAuthorName(existing) === normalizeAuthorName(title))) {
            entry.works.push(title);
        }
    }

    const matches = [];
    for (const entry of authorsByNormalizedName.values()) {
        const score = getAuthorSimilarityScore(trimmedQuery, entry.author);
        if (score <= 0) continue;
        matches.push({
            author: entry.author,
            works: entry.works,
            score,
            isExactMatch: entry.author === trimmedQuery,
            isNormalizedExactMatch: entry.normalizedAuthor === normalizedQuery
        });
    }

    return matches
        .sort((left, right) => (
            right.score - left.score
            || left.author.localeCompare(right.author, "pt-BR")
        ))
        .slice(0, limit);
}
