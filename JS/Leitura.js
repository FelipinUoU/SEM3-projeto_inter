import { getCurrentLibraryUser, recordReadChapter } from "./userLibrary.js";

const viewModeButton = document.getElementById("view-mode-btn");
const viewDropdown = document.getElementById("view-dropdown");
const readerViewport = document.getElementById("reader-viewport");
const pageCounter = document.getElementById("page-counter");
const translateButton = document.getElementById("translate-btn");
const translateText = document.getElementById("translate-text");
const translationStatus = document.getElementById("translation-status");
const settingsButton = document.getElementById("translation-settings-btn");
const settingsDialog = document.getElementById("translation-dialog");
const settingsForm = document.getElementById("translation-settings-form");
const cancelSettingsButton = document.getElementById("cancel-translation-settings");
const languageSelect = document.getElementById("translation-language");
const scopeSelect = document.getElementById("translation-scope");
const capitalizationSelect = document.getElementById("translation-capitalization");
const fontSelect = document.getElementById("translation-font");
const settingsKey = "hokupedia.translationSettings.v1";
const defaultSettings = {
    language: "Português brasileiro",
    scope: "current",
    capitalization: "sentence",
    font: "arial"
};
const readerQuery = new URLSearchParams(window.location.search);
const workId = readerQuery.get("obra");
const chapterId = readerQuery.get("capitulo");
const translationCache = new Map();
let settings = loadSettings();
let settingsBeforeDialog;
let wrappers = [];
let currentPageIndex = 0;
let currentMode = "vertical";
let currentWork;
let currentChapter;
let translationLayer;
const pageTranslationLayers = new Map();
let translationController;
let statusTimeout;

const pageTranslationSchema = {
    type: "OBJECT",
    properties: {
        detectedLanguage: { type: "STRING" },
        bubbles: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    x: { type: "INTEGER" },
                    y: { type: "INTEGER" },
                    width: { type: "INTEGER" },
                    height: { type: "INTEGER" },
                    square: { type: "BOOLEAN" },
                    originalText: { type: "STRING" },
                    id: { type: "INTEGER" },
                    translation: { type: "STRING" }
                },
                required: ["x", "y", "width", "height", "square", "originalText", "id", "translation"]
            }
        }
    },
    required: ["detectedLanguage", "bubbles"]
};

function loadSettings() {
    try {
        const stored = localStorage.getItem(settingsKey);
        if (!stored) return { ...defaultSettings };
        const value = JSON.parse(stored);
        return {
            language: languageSelect.querySelector(`option[value="${CSS.escape(value.language)}"]`)
                ? value.language : defaultSettings.language,
            scope: ["current", "all"].includes(value.scope) ? value.scope : defaultSettings.scope,
            capitalization: ["sentence", "uppercase"].includes(value.capitalization)
                ? value.capitalization : defaultSettings.capitalization,
            font: ["arial", "trebuchet", "georgia", "comic"].includes(value.font)
                ? value.font : defaultSettings.font
        };
    } catch (error) {
        console.error("Não foi possível carregar as configurações de tradução:", error);
        return { ...defaultSettings };
    }
}

function applySettingsToForm() {
    languageSelect.value = settings.language;
    scopeSelect.value = settings.scope;
    capitalizationSelect.value = settings.capitalization;
    fontSelect.value = settings.font;
    setTranslationPending(Boolean(translationController));
}

function setStatus(message, type = "") {
    window.clearTimeout(statusTimeout);
    translationStatus.textContent = message;
    if (type) translationStatus.dataset.type = type;
    else delete translationStatus.dataset.type;
    if (type === "success") {
        statusTimeout = window.setTimeout(() => {
            if (translationStatus.textContent === message) {
                translationStatus.textContent = "";
                delete translationStatus.dataset.type;
            }
        }, 4000);
    }
}

function getChapterName(chapter, index) {
    const number = Number.isInteger(chapter?.number) ? chapter.number : index + 1;
    return `Capítulo ${number}${chapter?.title ? ` — ${chapter.title}` : ""}`;
}

function setChapterNavigation(work, chapter) {
    const chapters = work?.chapters || [];
    const index = chapters.findIndex((item) => item.id === chapter?.id);
    const chapterUrl = (target) => `/HTML/Leitura.html?obra=${encodeURIComponent(work.id)}&capitulo=${encodeURIComponent(target.id)}`;
    const previousButton = document.getElementById("previous-chapter-btn");
    const nextButton = document.getElementById("next-chapter-btn");
    const indexUrl = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;

    document.getElementById("reader-work-title").textContent = work.title;
    document.getElementById("reader-work-link").textContent = work.title;
    document.getElementById("reader-work-link").href = indexUrl;
    document.getElementById("chapter-index-link").href = indexUrl;
    document.getElementById("current-chapter-breadcrumb").textContent = getChapterName(chapter, index);
    document.getElementById("chapter-label").textContent = getChapterName(chapter, index);
    document.getElementById("end-chapter-title").textContent = `Fim do ${getChapterName(chapter, index).toLocaleLowerCase("pt-BR")}`;
    document.title = `${getChapterName(chapter, index)} — ${work.title} | HokuPédia`;

    const previous = chapters[index - 1];
    const next = chapters[index + 1];
    previousButton.disabled = !previous;
    nextButton.disabled = !next;
    previousButton.textContent = previous ? `❮ ${getChapterName(previous, index - 1)}` : "❮ Capítulo anterior";
    nextButton.textContent = next ? `${getChapterName(next, index + 1)} ❯` : "Próximo capítulo ❯";
    previousButton.onclick = previous ? () => window.location.assign(chapterUrl(previous)) : null;
    nextButton.onclick = next ? () => window.location.assign(chapterUrl(next)) : null;
    previousButton.classList.toggle("is-disabled", !previous);
    nextButton.classList.toggle("is-disabled", !next);
}

async function loadStoredChapter() {
    readerViewport.replaceChildren();
    readerViewport.setAttribute("aria-busy", "true");
    setStatus(workId && chapterId ? "Carregando capítulo..." : "Selecione um capítulo para começar.");
    if (!workId && !chapterId) {
        readerViewport.setAttribute("aria-busy", "false");
        refreshPages();
        return;
    }
    if (!workId || !chapterId) {
        setStatus("O link do capítulo está incompleto.", "error");
        readerViewport.setAttribute("aria-busy", "false");
        refreshPages();
        return;
    }

    try {
        const response = await fetch("/api/works");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as obras.");
        const works = data.works;
        currentWork = works.find((work) => work.id === workId);
        currentChapter = currentWork?.chapters?.find((chapter) => chapter.id === chapterId);
        if (!currentWork || !currentChapter) {
            throw new Error("A obra ou o capítulo não foi encontrado neste navegador.");
        }

        const pages = currentChapter.pages || [];
        if (!pages.length || pages.some((page) => typeof page.url !== "string" || !page.url.startsWith("https://"))) {
            throw new Error("Este capítulo não tem páginas válidas no ImageKit.");
        }

        readerViewport.replaceChildren(...pages.map((page, index) => {
            const wrapper = document.createElement("div");
            wrapper.className = "manga-page-wrapper";
            wrapper.dataset.page = String(index);
            const image = document.createElement("img");
            image.className = "manga-page";
            image.crossOrigin = "anonymous";
            image.src = page.url;
            image.alt = `Página ${index + 1} de ${getChapterName(currentChapter, 0)}`;
            image.loading = index === 0 ? "eager" : "lazy";
            wrapper.append(image);
            return wrapper;
        }));
        setChapterNavigation(currentWork, currentChapter);
        readerViewport.setAttribute("aria-busy", "false");
        setStatus("");
        refreshPages();

        try {
            const user = await getCurrentLibraryUser();
            recordReadChapter(user?.$id || null, workId, chapterId);
        } catch (error) {
            console.error("Não foi possível salvar o histórico da biblioteca:", error);
            setStatus("O capítulo abriu, mas não foi possível salvar seu progresso nesta conta.", "error");
        }
    } catch (error) {
        console.error("Não foi possível abrir o capítulo do Appwrite:", error);
        readerViewport.replaceChildren();
        readerViewport.setAttribute("aria-busy", "false");
        setStatus(error.message || "Não foi possível abrir este capítulo.", "error");
        refreshPages();
    }
}

function refreshPages() {
    wrappers = [...readerViewport.querySelectorAll(".manga-page-wrapper")];
    if (wrappers.length === 0) {
        pageCounter.textContent = "0 / 0";
        translateButton.disabled = true;
        return;
    }
    currentPageIndex = Math.min(currentPageIndex, wrappers.length - 1);
    if (currentMode === "horizontal") showHorizontalPage(currentPageIndex);
    updateCounter();
}

function updateCounter() {
    const chapterText = currentChapter
        ? getChapterName(currentChapter, currentWork.chapters.indexOf(currentChapter))
        : "Cap. 1";
    pageCounter.textContent = `${chapterText} (${currentPageIndex + 1}/${wrappers.length})`;
}

function syncCurrentTranslation() {
    const currentTranslation = pageTranslationLayers.get(wrappers[currentPageIndex]);
    translationLayer = currentTranslation?.layer;
    translateButton.setAttribute("aria-pressed", String(Boolean(translationLayer)));
}

function clearTranslation(wrapper) {
    const targets = wrapper ? [wrapper] : [...pageTranslationLayers.keys()];
    targets.forEach((target) => {
        const translation = pageTranslationLayers.get(target);
        if (!translation) return;
        translation.observer?.disconnect();
        translation.layer.remove();
        pageTranslationLayers.delete(target);
    });
    syncCurrentTranslation();
}

function positionTranslationLayers() {
    pageTranslationLayers.forEach((translation) => translation.position());
}

function setTranslationPending(isPending) {
    translateButton.setAttribute("aria-busy", String(isPending));
    const allPages = settings.scope === "all";
    translateText.textContent = isPending
        ? allPages ? "Parar tudo" : "Interromper"
        : allPages ? "Traduzir tudo" : "Tradução";
    translateButton.title = isPending
        ? allPages ? "Interromper todas as traduções" : "Interromper tradução"
        : allPages ? "Traduzir todas as páginas com IA" : "Traduzir página com IA";
}

function showHorizontalPage(index) {
    currentPageIndex = Math.max(0, Math.min(wrappers.length - 1, index));
    wrappers.forEach((wrapper, wrapperIndex) => {
        wrapper.classList.toggle("active-horizontal", wrapperIndex === currentPageIndex);
    });
    if (translationController && settings.scope !== "all") {
        translationController.abort("navigation");
        translationController = undefined;
        translateButton.disabled = false;
        setTranslationPending(false);
    }
    if (settings.scope !== "all" || !translationController) setStatus("");
    updateCounter();
    syncCurrentTranslation();
}

function setCurrentPage(index) {
    const nextPageIndex = Math.max(0, Math.min(wrappers.length - 1, index));
    if (nextPageIndex === currentPageIndex) return;
    currentPageIndex = nextPageIndex;
    if (translationController && settings.scope !== "all") {
        translationController.abort("navigation");
        translationController = undefined;
        translateButton.disabled = false;
        setTranslationPending(false);
    }
    if (settings.scope !== "all" || !translationController) setStatus("");
    updateCounter();
    syncCurrentTranslation();
}

function nearestVisiblePage() {
    if (currentMode !== "vertical" || wrappers.length === 0) return;
    const viewportCenter = window.innerHeight / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    wrappers.forEach((wrapper, index) => {
        const rect = wrapper.getBoundingClientRect();
        const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportCenter);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });
    setCurrentPage(closestIndex);
}

function goToPage(index) {
    if (currentMode === "horizontal") {
        showHorizontalPage(index);
    } else {
        const nextIndex = Math.max(0, Math.min(wrappers.length - 1, index));
        setCurrentPage(nextIndex);
        wrappers[nextIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function toggleMode(mode) {
    currentMode = mode;
    readerViewport.classList.toggle("vertical-mode", mode === "vertical");
    readerViewport.classList.toggle("horizontal-mode", mode === "horizontal");
    viewModeButton.innerHTML = `${mode === "vertical" ? "Vertical" : "Horizontal"} <span>▼</span>`;
    if (mode === "horizontal") showHorizontalPage(currentPageIndex);
    else {
        wrappers.forEach((wrapper) => wrapper.classList.remove("active-horizontal"));
        wrappers[currentPageIndex]?.scrollIntoView({ block: "center" });
        updateCounter();
        syncCurrentTranslation();
    }
}

async function imageToBase64(image) {
    if (!image.complete) await image.decode();
    if (!image.naturalWidth) throw new Error("A imagem desta página não pôde ser carregada.");
    const maxDimension = 2560;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem para tradução.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível codificar a imagem.")), "image/jpeg", 0.9);
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const cacheKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { inlineData: { data: btoa(binary), mimeType: blob.type }, cacheKey };
}

async function requestAI(parts, responseSchema, controller, maxOutputTokens) {
    let response;
    try {
        response = await fetch("/api/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                    maxOutputTokens,
                    responseMimeType: "application/json",
                    responseSchema,
                    thinkingConfig: { thinkingLevel: "LOW" }
                },
                responseSchema
            })
        });
    } catch (error) {
        if (controller.signal.aborted || error.name === "AbortError") throw error;
        throw new Error("Não foi possível conectar à API de IA. Inicie o backend com `npm run server`.");
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`A API de IA retornou uma resposta inválida (HTTP ${response.status}).`);
    }
    if (!response.ok) {
        const message = result.error?.message || `Erro HTTP ${response.status}.`;
        if (response.status === 503) throw new Error(`Configure pelo menos uma chave de IA no arquivo .env. ${message}`);
        if (response.status === 429) throw new Error(`O limite de solicitações da IA foi atingido. ${message}`);
        throw new Error(`Falha na tradução (HTTP ${response.status}): ${message}`);
    }

    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("O provedor de IA não retornou conteúdo.");
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("O provedor de IA retornou dados em formato inesperado.");
    }
}

function validateBubbles(bubbles) {
    if (!Array.isArray(bubbles)) throw new Error("A IA não retornou uma lista de balões válida.");
    return bubbles.map((bubble, index) => {
        const validBox = bubble && [bubble.x, bubble.y, bubble.width, bubble.height].every(Number.isFinite)
            && bubble.x >= 0 && bubble.y >= 0 && bubble.width > 0 && bubble.height > 0
            && bubble.x + bubble.width <= 1000 && bubble.y + bubble.height <= 1000;
        if (!validBox || typeof bubble.square !== "boolean"
            || typeof bubble.originalText !== "string" || !bubble.originalText.trim()) {
            throw new Error(`A IA retornou dados inválidos para o balão ${index + 1}.`);
        }
        return { ...bubble, id: index + 1, originalText: bubble.originalText.trim() };
    });
}

function validateTranslations(items, bubbles) {
    if (!Array.isArray(items)) throw new Error("A IA não retornou as traduções esperadas.");
    const translations = new Map();
    items.forEach((item) => {
        if (!item || !bubbles.some((bubble) => bubble.id === item.id)
            || translations.has(item.id) || typeof item.translation !== "string" || !item.translation.trim()) {
            throw new Error("A IA retornou traduções incompletas ou inválidas.");
        }
        translations.set(item.id, item.translation.trim());
    });
    if (translations.size !== bubbles.length) throw new Error("A IA não traduziu todos os balões.");
    return bubbles.map((bubble) => ({ ...bubble, translation: translations.get(bubble.id) }));
}

function formatTranslation(text) {
    const locale = {
        "Português brasileiro": "pt-BR",
        English: "en",
        Español: "es",
        "日本語": "ja",
        "한국어": "ko",
        Français: "fr"
    }[settings.language] || "pt-BR";
    if (settings.capitalization === "uppercase") return text.toLocaleUpperCase(locale);
    return text.toLocaleLowerCase(locale).replace(/(^|[.!?。！？]\s*)(\p{L})/gu, (match, boundary, letter) => (
        `${boundary}${letter.toLocaleUpperCase(locale)}`
    ));
}

function fitBubbleText(element, bubble) {
    const fonts = {
        arial: "Arial, Helvetica, sans-serif",
        trebuchet: "'Trebuchet MS', Arial, sans-serif",
        georgia: "Georgia, 'Times New Roman', serif",
        comic: "'Comic Sans MS', 'Comic Sans', cursive"
    };
    const formatted = formatTranslation(bubble.translation);
    element.textContent = formatted;
    element.style.fontFamily = fonts[settings.font];
    element.setAttribute("aria-label", `Original: ${bubble.originalText}. Tradução: ${formatted}`);
    let low = 2;
    let high = Math.max(4, Math.min(24, element.clientWidth * 0.11, element.clientHeight * 0.28));
    let bestFit = low;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const fontSize = (low + high) / 2;
        element.style.fontSize = `${fontSize}px`;
        if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) {
            bestFit = fontSize;
            low = fontSize;
        } else {
            high = fontSize;
        }
    }
    element.style.fontSize = `${bestFit}px`;
}

function displayTranslations(bubbles, wrapper) {
    clearTranslation(wrapper);
    const image = wrapper.querySelector("img");
    const layer = document.createElement("div");
    layer.className = "translation-layer";
    layer.setAttribute("aria-label", "Tradução dos balões");
    const elements = bubbles.map((bubble) => {
        const element = document.createElement("span");
        element.className = bubble.square
            ? "translated-bubble translated-bubble--square"
            : "translated-bubble";
        element.title = `Original: ${bubble.originalText}`;
        element.style.left = `${bubble.x / 10}%`;
        element.style.top = `${bubble.y / 10}%`;
        element.style.width = `${bubble.width / 10}%`;
        element.style.height = `${bubble.height / 10}%`;
        layer.append(element);
        return element;
    });
    wrapper.append(layer);
    const positionLayer = () => {
        const imageRect = image.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        layer.style.left = `${imageRect.left - wrapperRect.left}px`;
        layer.style.top = `${imageRect.top - wrapperRect.top}px`;
        layer.style.width = `${imageRect.width}px`;
        layer.style.height = `${imageRect.height}px`;
        elements.forEach((element, index) => fitBubbleText(element, bubbles[index]));
    };
    positionLayer();
    const translation = { layer, bubbles, observer: undefined, position: positionLayer };
    pageTranslationLayers.set(wrapper, translation);
    if ("ResizeObserver" in window) {
        translation.observer = new ResizeObserver(positionLayer);
        translation.observer.observe(image);
        translation.observer.observe(wrapper);
    }
    syncCurrentTranslation();
}

async function getTranslatedBubbles(pageIndex, controller) {
    const wrapper = wrappers[pageIndex];
    const image = await imageToBase64(wrapper.querySelector("img"));
    if (controller.signal.aborted) throw new DOMException("Tradução cancelada.", "AbortError");
    const translationKey = `${image.cacheKey}:${settings.language}`;
    const cached = translationCache.get(translationKey);
    if (cached) return cached;

    const result = await requestAI([{
        text: `Analise a página de quadrinhos anexada e faça OCR dos balões de fala e pensamento. Percorra a página de cima para baixo e da esquerda para a direita. Retorne detectedLanguage e, para cada balão legível, um id sequencial começando em 1, originalText transcrito fielmente, translation traduzida integralmente para ${settings.language}, e uma caixa x, y, width e height em inteiros de 0 a 1000 normalizados pela imagem inteira que cubra o interior do balão sem a cauda. Defina square como true para balões quadrados/retangulares de lados retos; false para balões ovais/arredondados. Exclua quadros, legendas, narração, textos fora de balões e efeitos sonoros. Não invente nem resuma falas.`
    }, { inlineData: image.inlineData }], pageTranslationSchema, controller, 8192);
    if (controller.signal.aborted) throw new DOMException("Tradução cancelada.", "AbortError");
    const bubbles = validateBubbles(result.bubbles);
    const translatedBubbles = validateTranslations(result.bubbles, bubbles);
    translationCache.set(translationKey, translatedBubbles);
    return translatedBubbles;
}

function handleTranslationError(error, controller) {
    if (controller.signal.aborted) {
        if (controller.signal.reason === "timeout") {
            setStatus("A solicitação de tradução excedeu o limite de tempo e foi cancelada. Tente novamente.", "error");
        } else if (controller.signal.reason === "user") {
            setStatus("Tradução interrompida.");
        }
    } else if (error.name === "AbortError") {
        setStatus("A solicitação de tradução foi cancelada.", "error");
    } else {
        console.error("Falha ao traduzir as páginas:", error);
        setStatus(error.message || "Não foi possível traduzir as páginas.", "error");
    }
}

async function translateCurrentPage() {
    if (translateButton.disabled || wrappers.length === 0) return;
    const requestedIndex = currentPageIndex;
    const controller = new AbortController();
    translationController = controller;
    setTranslationPending(true);
    setStatus("Analisando e traduzindo a página…");
    const requestTimeout = window.setTimeout(() => controller.abort("timeout"), 18 * 60 * 1000);

    try {
        const translatedBubbles = await getTranslatedBubbles(requestedIndex, controller);
        if (controller.signal.aborted || requestedIndex !== currentPageIndex) return;
        displayTranslations(translatedBubbles, wrappers[requestedIndex]);
        setStatus(translatedBubbles.length
            ? `Página traduzida para ${settings.language}.`
            : "Nenhum balão legível foi encontrado nesta página.", translatedBubbles.length ? "success" : "error");
    } catch (error) {
        handleTranslationError(error, controller);
    } finally {
        window.clearTimeout(requestTimeout);
        if (translationController === controller) {
            translationController = undefined;
            translateButton.disabled = false;
            setTranslationPending(false);
        }
    }
}

async function translateAllPages() {
    if (translateButton.disabled || wrappers.length === 0) return;
    const pendingIndices = wrappers
        .map((wrapper, index) => ({ wrapper, index }))
        .filter(({ wrapper }) => !pageTranslationLayers.has(wrapper))
        .map(({ index }) => index);
    if (pendingIndices.length === 0) {
        clearTranslation();
        setStatus("Traduções ocultadas.");
        return;
    }

    const controller = new AbortController();
    translationController = controller;
    setTranslationPending(true);
    setStatus(`Preparando tradução de ${pendingIndices.length} páginas…`);
    const requestTimeout = window.setTimeout(() => controller.abort("timeout"), 18 * 60 * 1000);
    let nextIndex = 0;
    let completed = 0;
    let firstError;

    const worker = async () => {
        while (nextIndex < pendingIndices.length && !controller.signal.aborted && !firstError) {
            const pageIndex = pendingIndices[nextIndex];
            nextIndex += 1;
            try {
                setStatus(`Traduzindo página ${pageIndex + 1}/${wrappers.length} (${completed}/${pendingIndices.length} concluídas)…`);
                const translatedBubbles = await getTranslatedBubbles(pageIndex, controller);
                if (controller.signal.aborted) return;
                displayTranslations(translatedBubbles, wrappers[pageIndex]);
                completed += 1;
            } catch (error) {
                firstError = error;
            }
        }
    };

    try {
        await Promise.all(Array.from(
            { length: Math.min(2, pendingIndices.length) },
            () => worker()
        ));
        if (firstError) throw firstError;
        if (!controller.signal.aborted) {
            setStatus(`Tradução concluída: ${completed} páginas processadas.`, "success");
        }
    } catch (error) {
        handleTranslationError(error, controller);
    } finally {
        window.clearTimeout(requestTimeout);
        if (translationController === controller) {
            translationController = undefined;
            translateButton.disabled = false;
            setTranslationPending(false);
            syncCurrentTranslation();
        }
    }
}

applySettingsToForm();
void loadStoredChapter();

viewModeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    viewDropdown.classList.toggle("show");
});

viewDropdown.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
        toggleMode(button.dataset.mode);
        viewDropdown.classList.remove("show");
    });
});

window.addEventListener("click", () => viewDropdown.classList.remove("show"));
window.addEventListener("keydown", (event) => {
    if (currentMode !== "horizontal" || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if (event.target instanceof Element
        && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    goToPage(currentPageIndex + (event.key === "ArrowRight" ? 1 : -1));
});
readerViewport.addEventListener("click", (event) => {
    if (currentMode !== "horizontal" || !(event.target instanceof HTMLImageElement)) return;
    const page = event.target.closest(".manga-page");
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    if (!bounds.width) return;
    const horizontalPosition = (event.clientX - bounds.left) / bounds.width;
    if (horizontalPosition <= 0.25) {
        goToPage(currentPageIndex - 1);
    } else if (horizontalPosition >= 0.75) {
        goToPage(currentPageIndex + 1);
    }
});
window.addEventListener("scroll", nearestVisiblePage, { passive: true });
window.addEventListener("resize", () => {
    positionTranslationLayers();
    nearestVisiblePage();
});

translateButton.addEventListener("click", () => {
    if (translationController) {
        translationController.abort("user");
    } else if (settings.scope === "all") {
        if (wrappers.length > 0 && wrappers.every((wrapper) => pageTranslationLayers.has(wrapper))) {
            clearTranslation();
            setStatus("Traduções ocultadas.");
        } else {
            void translateAllPages();
        }
    } else if (translationLayer) {
        clearTranslation(wrappers[currentPageIndex]);
        setStatus("Tradução ocultada.");
    } else {
        nearestVisiblePage();
        void translateCurrentPage();
    }
});

settingsButton.addEventListener("click", () => {
    translationController?.abort("settings");
    settingsBeforeDialog = { ...settings };
    settingsDialog.showModal();
});

cancelSettingsButton.addEventListener("click", () => {
    settingsDialog.close();
    settings = settingsBeforeDialog || { ...defaultSettings };
    settingsBeforeDialog = undefined;
    applySettingsToForm();
});

settingsDialog.addEventListener("cancel", () => {
    settings = settingsBeforeDialog || { ...defaultSettings };
    settingsBeforeDialog = undefined;
    applySettingsToForm();
});

settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextSettings = {
        language: languageSelect.value,
        scope: scopeSelect.value,
        capitalization: capitalizationSelect.value,
        font: fontSelect.value
    };
    try {
        localStorage.setItem(settingsKey, JSON.stringify(nextSettings));
    } catch (error) {
        console.error("Não foi possível salvar as configurações de tradução:", error);
        setStatus("Não foi possível salvar as configurações neste navegador.", "error");
        return;
    }
    const languageChanged = settings.language !== nextSettings.language;
    const scopeChanged = settings.scope !== nextSettings.scope;
    const hasTranslations = pageTranslationLayers.size > 0;
    settings = nextSettings;
    setTranslationPending(Boolean(translationController));
    settingsBeforeDialog = undefined;
    settingsDialog.close();
    if (languageChanged && hasTranslations) {
        clearTranslation();
        if (settings.scope === "all") void translateAllPages();
        else void translateCurrentPage();
    } else if ((!languageChanged || !hasTranslations) && (hasTranslations || scopeChanged)) {
        [...pageTranslationLayers.entries()].forEach(([wrapper, translation]) => {
            displayTranslations(translation.bubbles, wrapper);
        });
        if (hasTranslations) setStatus("Configurações aplicadas.", "success");
    }
});

window.addEventListener("pagehide", () => {
    translationController?.abort("chapter-exit");
    clearTranslation();
    translationCache.clear();
});
