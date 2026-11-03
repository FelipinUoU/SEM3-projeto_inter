export function getStoredChapterTranslations(storage, key) {
    if (!key) return {};
    const stored = storage.getItem(key);
    if (!stored) return {};
    const record = JSON.parse(stored);
    if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("Os dados salvos das traduções deste capítulo estão inválidos.");
    }
    return record;
}

export function saveTranslatedPage(storage, key, language, pageId, bubbles) {
    if (!key || !pageId) return false;
    try {
        const record = getStoredChapterTranslations(storage, key);
        const languageTranslations = record[language] || {};
        if (!languageTranslations || typeof languageTranslations !== "object" || Array.isArray(languageTranslations)) {
            throw new Error("O registro salvo para este idioma está inválido.");
        }
        languageTranslations[pageId] = bubbles;
        record[language] = languageTranslations;
        storage.setItem(key, JSON.stringify(record));
        return true;
    } catch (error) {
        console.error("Não foi possível salvar a tradução neste navegador:", error);
        return false;
    }
}

export function getStoredPageAnalysis(storage, key, pageId, imageKey) {
    if (!key || !pageId || !imageKey) return null;
    const stored = storage.getItem(key);
    if (!stored) return null;
    const record = JSON.parse(stored);
    if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("O cache local das análises deste capítulo está inválido.");
    }
    const entry = record[pageId];
    if (!entry || entry.imageKey !== imageKey) return null;
    if (typeof entry.detectedLanguage !== "string" || !Array.isArray(entry.bubbles)) {
        throw new Error("A análise salva para esta página está inválida.");
    }
    return { detectedLanguage: entry.detectedLanguage, bubbles: entry.bubbles };
}

export function savePageAnalysis(storage, key, pageId, imageKey, analysis) {
    if (!key || !pageId || !imageKey) return false;
    try {
        const stored = storage.getItem(key);
        const record = stored ? JSON.parse(stored) : {};
        if (!record || typeof record !== "object" || Array.isArray(record)) {
            throw new Error("O cache local das análises deste capítulo está inválido.");
        }
        record[pageId] = {
            imageKey,
            detectedLanguage: analysis.detectedLanguage,
            bubbles: analysis.bubbles
        };
        storage.setItem(key, JSON.stringify(record));
        return true;
    } catch (error) {
        console.error("Não foi possível salvar a análise intermediária neste navegador:", error);
        return false;
    }
}

export function removeStoredPageAnalysis(storage, key, pageId) {
    if (!key || !pageId) return false;
    try {
        const stored = storage.getItem(key);
        if (!stored) return true;
        const record = JSON.parse(stored);
        if (!record || typeof record !== "object" || Array.isArray(record)) {
            throw new Error("O cache local das análises deste capítulo está inválido.");
        }
        delete record[pageId];
        if (Object.keys(record).length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(record));
        return true;
    } catch (error) {
        console.error("Não foi possível limpar a análise intermediária salva:", error);
        return false;
    }
}
