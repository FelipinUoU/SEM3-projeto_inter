(() => {
    const readerQuery = new URLSearchParams(window.location.search);
    const workId = readerQuery.get("obra");
    const chapterId = readerQuery.get("capitulo");
    if (workId && chapterId) {
        try {
            const historyKey = "hokupedia.readChapters.v1";
            const storedHistory = localStorage.getItem(historyKey);
            const parsedHistory = storedHistory === null ? [] : JSON.parse(storedHistory);
            if (!Array.isArray(parsedHistory) || parsedHistory.some((item) => typeof item !== "string")) {
                throw new Error("O histórico local de leitura está inválido.");
            }
            const chapterKey = `${workId}:${chapterId}`;
            if (!parsedHistory.includes(chapterKey)) {
                parsedHistory.push(chapterKey);
                localStorage.setItem(historyKey, JSON.stringify(parsedHistory));
            }
        } catch (error) {
            console.error("Não foi possível registrar este capítulo no histórico local:", error);
        }
    }

    const reader = document.getElementById("reader");
    const chapterSelectionLink = document.getElementById("chapterSelectionLink");
    const pageArea = document.getElementById("pageArea");
    const comicPage = document.getElementById("comicPage");
    const currentPageLabel = document.getElementById("currentPage");
    const totalPagesLabel = document.getElementById("totalPages");
    const topMenu = document.getElementById("topMenu");
    const menuTrigger = document.getElementById("menuTrigger");
    const resizeMenu = document.getElementById("resizeMenu");
    const resizeTrigger = document.getElementById("resizeTrigger");
    const readingMenu = document.getElementById("readingMenu");
    const readingTrigger = document.getElementById("readingTrigger");
    const readingModeButtons = document.querySelectorAll("[data-reading-mode]");
    const translateButton = document.getElementById("translateButton");
    const translationSettingsButton = document.getElementById("translationSettingsButton");
    const translationDialog = document.getElementById("translationDialog");
    const translationForm = document.getElementById("translationForm");
    const languageSelect = document.getElementById("translationLanguage");
    const capitalizationSelect = document.getElementById("translationCapitalization");
    const fontSelect = document.getElementById("translationFont");
    const translationStatus = document.getElementById("translationStatus");
    const cancelTranslationSettings = document.getElementById("cancelTranslationSettings");
    let pageImages = [];
    let currentPage = 1;
    let readingMode = "manga";
    let cursorTimeout;
    let translationLayer;
    let translationObserver;
    let translationPositionHandler;
    let translationController;
    let translationStatusTimeout;
    let activeTranslatedBubbles = [];
    let settingsBeforeDialog;
    const pageAnalysisCache = new Map();
    const pageTranslationCache = new Map();
    const apiEndpoint = "/api/gemini";
    if (chapterSelectionLink && workId) {
        chapterSelectionLink.href = `/Obra?obra=${encodeURIComponent(workId)}`;
    }
    const analysisSchema = {
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
                        originalText: { type: "STRING" },
                    },
                    required: ["x", "y", "width", "height", "originalText"],
                },
            },
        },
        required: ["detectedLanguage", "bubbles"],
    };
    const translationSchema = {
        type: "OBJECT",
        properties: {
            translations: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        id: { type: "INTEGER" },
                        translation: { type: "STRING" },
                    },
                    required: ["id", "translation"],
                },
            },
        },
        required: ["translations"],
    };

    function showCursor() {
        reader.classList.remove("cursor-hidden");
        window.clearTimeout(cursorTimeout);
        cursorTimeout = window.setTimeout(() => {
            reader.classList.add("cursor-hidden");
        }, 2500);
    }

    reader.addEventListener("pointermove", showCursor);
    reader.addEventListener("pointerdown", showCursor);
    document.addEventListener("keydown", showCursor);
    showCursor();

    function showPage(pageNumber) {
        const nextPage = Math.max(1, Math.min(pageImages.length, pageNumber));
        if (nextPage === currentPage) return;

        currentPage = nextPage;
        clearTranslationLayer();
        translationController?.abort();
        translationController = undefined;
        translateButton.disabled = false;
        translateButton.setAttribute("aria-pressed", "false");
        setTranslationStatus("");
        comicPage.src = `/reader/${encodeURIComponent(pageImages[currentPage - 1])}`;
        comicPage.alt = `Página ${currentPage} do quadrinho`;
        currentPageLabel.textContent = String(currentPage);
    }

    async function loadPageImages(reportError = false) {
        try {
            const response = await fetch("/api/reader/pages", { cache: "no-store" });
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
                throw new Error("O servidor local está desatualizado e não reconhece a rota de páginas. Pare e reinicie `npm run server` e reabra o leitor em http://localhost:3001/Leitura.");
            }

            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error("O servidor retornou uma lista de páginas inválida. Reinicie `npm run server` e tente novamente.");
            }
            if (!response.ok) {
                throw new Error(result.error?.message || `Erro HTTP ${response.status} ao listar as páginas.`);
            }
            if (!Array.isArray(result.pages)
                || result.pages.some((name) => typeof name !== "string" || !name.trim())) {
                throw new Error("O servidor retornou uma lista inválida de páginas.");
            }

            const previousName = pageImages[currentPage - 1]
                || decodeURIComponent(new URL(comicPage.src).pathname.split("/").pop());
            const previousPage = currentPage;
            const previousImage = pageImages[currentPage - 1];
            pageImages = result.pages;
            totalPagesLabel.textContent = String(pageImages.length);

            if (pageImages.length === 0) {
                currentPage = 0;
                currentPageLabel.textContent = "0";
                comicPage.removeAttribute("src");
                setTranslationStatus("Nenhuma página disponível. Adicione imagens à pasta TELA DE LEITURA para começar a leitura.", "error");
                return;
            }

            const existingPageIndex = pageImages.indexOf(previousName);
            currentPage = existingPageIndex >= 0
                ? existingPageIndex + 1
                : Math.min(Math.max(previousPage, 1), pageImages.length);
            const selectedImage = pageImages[currentPage - 1];
            currentPageLabel.textContent = String(currentPage);

            if (selectedImage !== previousImage) {
                clearTranslationLayer();
                translationController?.abort();
                translationController = undefined;
                translateButton.disabled = false;
                translateButton.setAttribute("aria-pressed", "false");
                comicPage.src = `/reader/${encodeURIComponent(selectedImage)}`;
                comicPage.alt = `Página ${currentPage} do quadrinho`;
                setTranslationStatus("");
            }
        } catch (error) {
            if (reportError) {
                setTranslationStatus(error.message || "Não foi possível carregar as páginas do leitor.", "error");
            } else {
                console.error("Falha ao atualizar as páginas do leitor:", error);
            }
        }
    }

    function setTranslationStatus(message, type = "") {
        window.clearTimeout(translationStatusTimeout);
        translationStatus.textContent = message;
        if (type) {
            translationStatus.dataset.type = type;
        } else {
            delete translationStatus.dataset.type;
        }
        if (type === "success") {
            translationStatusTimeout = window.setTimeout(() => {
                if (translationStatus.textContent === message) {
                    translationStatus.textContent = "";
                    delete translationStatus.dataset.type;
                }
            }, 2000);
        }
    }

    function clearTranslationLayer() {
        translationObserver?.disconnect();
        translationObserver = undefined;
        if (translationPositionHandler) {
            pageArea.removeEventListener("scroll", translationPositionHandler);
            window.removeEventListener("resize", translationPositionHandler);
            translationPositionHandler = undefined;
        }
        translationLayer?.remove();
        translationLayer = undefined;
        activeTranslatedBubbles = [];
    }

    function openTranslationSettings() {
        translationController?.abort();
        translationController = undefined;
        translateButton.disabled = false;
        setTranslationStatus("");
        settingsBeforeDialog = {
            language: languageSelect.value,
            capitalization: capitalizationSelect.value,
            font: fontSelect.value,
        };
        translationDialog.showModal();
        languageSelect.focus();
    }

    function restoreTranslationSettings() {
        if (!settingsBeforeDialog) return;
        languageSelect.value = settingsBeforeDialog.language;
        capitalizationSelect.value = settingsBeforeDialog.capitalization;
        fontSelect.value = settingsBeforeDialog.font;
        updateTranslationPresentation();
        settingsBeforeDialog = undefined;
    }

    function imageToBase64(image) {
        if (!image.complete || !image.naturalWidth) {
            return Promise.reject(new Error("A imagem da página ainda não foi carregada."));
        }

        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        try {
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Não foi possível preparar a imagem para análise.");
            context.drawImage(image, 0, 0);
        } catch (error) {
            return Promise.reject(new Error(`Não foi possível ler a imagem para tradução. Abra o leitor por um servidor local ou HTTP em vez de file://. ${error.message}`));
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                try {
                    if (!blob) throw new Error("Não foi possível codificar a imagem da página.");

                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    let binary = "";
                    const chunkSize = 0x8000;
                    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
                    }
                    let cacheKey;
                    if (globalThis.crypto?.subtle) {
                        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
                        cacheKey = Array.from(new Uint8Array(digest), (byte) => (
                            byte.toString(16).padStart(2, "0")
                        )).join("");
                    }
                    resolve({
                        inlineData: { data: btoa(binary), mimeType: blob.type },
                        cacheKey,
                    });
                } catch (error) {
                    reject(error);
                }
            }, "image/jpeg", 0.94);
        });
    }

    function validateExtractedBubbles(bubbles) {
        if (!Array.isArray(bubbles)) {
            throw new Error("A etapa de análise não retornou uma lista de balões. Tente novamente.");
        }

        return bubbles.map((bubble, index) => {
            if (!bubble || typeof bubble !== "object") {
                throw new Error(`A análise retornou dados inválidos para o balão ${index + 1}.`);
            }
            const values = [bubble.x, bubble.y, bubble.width, bubble.height];
            const hasValidBox = values.every(Number.isFinite)
                && bubble.x >= 0
                && bubble.y >= 0
                && bubble.width > 0
                && bubble.height > 0
                && bubble.x + bubble.width <= 1000
                && bubble.y + bubble.height <= 1000;
            if (!hasValidBox
                || typeof bubble.originalText !== "string"
                || !bubble.originalText.trim()) {
                throw new Error(`A análise retornou uma posição ou texto inválido para o balão ${index + 1}. Tente novamente.`);
            }

            return {
                id: index + 1,
                x: bubble.x,
                y: bubble.y,
                width: bubble.width,
                height: bubble.height,
                originalText: bubble.originalText.trim(),
            };
        });
    }

    async function requestAI(parts, responseSchema, controller, maxOutputTokens) {
        let response;
        try {
            response = await fetch(apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        maxOutputTokens,
                        responseMimeType: "application/json",
                        responseSchema,
                        thinkingConfig: { thinkingLevel: "LOW" },
                    },
                    responseSchema,
                }),
            });
        } catch (error) {
            if (error.name === "AbortError") throw error;
            throw new Error("Não foi possível conectar ao servidor local. Inicie-o com `npm run server` e abra http://localhost:3001/Leitura.");
        }

        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error(`O serviço de tradução respondeu com HTTP ${response.status}, mas a resposta não era um JSON válido.`);
        }
        if (!response.ok) {
            const message = result.error?.message || `Erro HTTP ${response.status}.`;
            if (response.status === 400 || response.status === 404) {
                throw new Error(`Os provedores de IA recusaram a solicitação: ${message}`);
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error(`Nenhum provedor de IA autorizou a solicitação: ${message} Confira as chaves no arquivo .env.`);
            }
            if (response.status === 429) {
                throw new Error(`A cota ou o limite de solicitações dos provedores de IA foi atingido: ${message}`);
            }
            throw new Error(`Falha nos provedores de IA (HTTP ${response.status}): ${message}`);
        }

        const candidate = result.candidates?.[0];
        const responseText = candidate?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();
        if (!responseText) {
            const reason = result.promptFeedback?.blockReason || candidate?.finishReason;
            if (reason === "MAX_TOKENS") {
                throw new Error("Um provedor atingiu o limite da resposta. A página pode ter texto demais; tente novamente.");
            }
            throw new Error(reason
                ? `O provedor selecionado não retornou dados (motivo: ${reason}).`
                : "Nenhum provedor retornou dados. Verifique as chaves e tente novamente.");
        }

        try {
            return JSON.parse(responseText);
        } catch {
            throw new Error("O provedor de IA retornou dados em formato inesperado. Tente novamente.");
        }
    }

    function validateTranslations(translations, bubbles) {
        if (!Array.isArray(translations)) {
            throw new Error("A etapa de tradução não retornou uma lista de textos.");
        }

        const expectedIds = new Set(bubbles.map((bubble) => bubble.id));
        const found = new Map();
        translations.forEach((item) => {
            if (!item || !expectedIds.has(item.id) || found.has(item.id)
                || typeof item.translation !== "string" || !item.translation.trim()) {
                throw new Error("A etapa de tradução retornou textos incompletos ou inválidos. Tente novamente.");
            }
            found.set(item.id, item.translation.trim());
        });

        if (found.size !== expectedIds.size) {
            throw new Error(`A etapa de tradução retornou ${found.size} de ${expectedIds.size} falas. Tente novamente.`);
        }

        return bubbles.map((bubble) => ({
            ...bubble,
            translation: found.get(bubble.id),
        }));
    }

    function displayTranslations(bubbles) {
        clearTranslationLayer();
        const layer = document.createElement("div");
        layer.className = "translation-layer";
        layer.setAttribute("aria-label", "Tradução dos balões");
        const translatedBubbles = [];
        const languageTags = {
            "Português brasileiro": "pt-BR",
            English: "en",
            Español: "es",
            "日本語": "ja",
            "한국어": "ko",
            Français: "fr",
        };

        bubbles.forEach((bubble) => {
            const translatedBubble = document.createElement("span");
            translatedBubble.className = "translated-bubble";
            translatedBubble.title = `Original: ${bubble.originalText}`;
            translatedBubble.setAttribute("aria-label", `Original: ${bubble.originalText}. Tradução: ${bubble.translation}`);
            translatedBubble.setAttribute("lang", languageTags[languageSelect.value] || "und");
            translatedBubble.dataset.translation = bubble.translation;
            translatedBubble.style.left = `${bubble.x / 10}%`;
            translatedBubble.style.top = `${bubble.y / 10}%`;
            translatedBubble.style.width = `${bubble.width / 10}%`;
            translatedBubble.style.height = `${bubble.height / 10}%`;
            layer.append(translatedBubble);
            translatedBubbles.push(translatedBubble);
        });

        pageArea.append(layer);
        translationLayer = layer;
        activeTranslatedBubbles = bubbles;

        const positionLayer = () => {
            if (!translationLayer) return;
            const imageRect = comicPage.getBoundingClientRect();
            const areaRect = pageArea.getBoundingClientRect();
            layer.style.left = `${imageRect.left - areaRect.left + pageArea.scrollLeft}px`;
            layer.style.top = `${imageRect.top - areaRect.top + pageArea.scrollTop}px`;
            layer.style.width = `${imageRect.width}px`;
            layer.style.height = `${imageRect.height}px`;
            bubbles.forEach((bubble, index) => {
                const bubbleWidth = imageRect.width * bubble.width / 1000;
                const bubbleHeight = imageRect.height * bubble.height / 1000;
                fitTranslatedText(translatedBubbles[index], bubble, bubbleWidth, bubbleHeight);
            });
        };

        positionLayer();
        if ("ResizeObserver" in window) {
            translationObserver = new ResizeObserver(positionLayer);
            translationObserver.observe(comicPage);
            translationObserver.observe(pageArea);
        }
        translationPositionHandler = positionLayer;
        pageArea.addEventListener("scroll", translationPositionHandler);
        window.addEventListener("resize", translationPositionHandler);
    }

    function formatTranslation(text) {
        const locale = {
            "Português brasileiro": "pt-BR",
            English: "en",
            Español: "es",
            "日本語": "ja",
            "한국어": "ko",
            Français: "fr",
        }[languageSelect.value] || "pt-BR";

        if (capitalizationSelect.value === "uppercase") {
            return text.toLocaleUpperCase(locale);
        }

        const sentenceCase = text.toLocaleLowerCase(locale);
        return sentenceCase.replace(/(^|[.!?。！？]\s*)(\p{L})/gu, (match, boundary, letter) => (
            `${boundary}${letter.toLocaleUpperCase(locale)}`
        ));
    }

    function fitTranslatedText(element, bubble, width, height) {
        const fonts = {
            arial: "Arial, Helvetica, sans-serif",
            trebuchet: "'Trebuchet MS', Arial, sans-serif",
            georgia: "Georgia, 'Times New Roman', serif",
            comic: "'Comic Sans MS', 'Comic Sans', cursive",
        };
        const formatted = formatTranslation(bubble.translation);
        element.textContent = formatted;
        element.setAttribute("aria-label", `Original: ${bubble.originalText}. Tradução: ${formatted}`);
        element.style.fontFamily = fonts[fontSelect.value] || fonts.arial;

        const maxFontSize = Math.max(4, Math.min(20, width * 0.11, height * 0.28));
        let low = 2;
        let high = maxFontSize;
        let bestFit = low;
        element.style.fontSize = `${low}px`;

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const fontSize = (low + high) / 2;
            element.style.fontSize = `${fontSize}px`;
            if (element.scrollWidth <= element.clientWidth
                && element.scrollHeight <= element.clientHeight) {
                bestFit = fontSize;
                low = fontSize;
            } else {
                high = fontSize;
            }
        }

        element.style.fontSize = `${bestFit}px`;
    }

    function updateTranslationPresentation() {
        if (!translationLayer) return;
        activeTranslatedBubbles.forEach((bubble, index) => {
            const element = translationLayer.children[index];
            const rect = element.getBoundingClientRect();
            fitTranslatedText(element, bubble, rect.width, rect.height);
        });
    }

    async function translateCurrentPage() {
        if (translateButton.disabled) return;

        const requestedPage = currentPage;
        const controller = new AbortController();
        let requestTimeout;
        translationController = controller;
        translateButton.disabled = true;
        setTranslationStatus("Verificando o cache da página…");

        try {
            const image = await imageToBase64(comicPage);
            const language = languageSelect.value;
            requestTimeout = window.setTimeout(() => controller.abort(), 1110000);

            if (requestedPage !== currentPage || controller.signal.aborted) return;
            const translationCacheKey = image.cacheKey
                ? `${image.cacheKey}:${language}`
                : undefined;
            const cachedTranslations = translationCacheKey
                ? pageTranslationCache.get(translationCacheKey)
                : undefined;
            if (cachedTranslations) {
                displayTranslations(cachedTranslations);
                translateButton.setAttribute("aria-pressed", "true");
                setTranslationStatus(`Tradução carregada do cache para ${language}.`, "success");
                return;
            }

            let analysisResult = image.cacheKey
                ? pageAnalysisCache.get(image.cacheKey)
                : undefined;
            const analysisWasCached = Boolean(analysisResult);
            let bubbles;
            if (analysisResult) {
                bubbles = analysisResult.bubbles;
            } else {
                setTranslationStatus("Etapa 1/2: analisando imagem e localizando balões. Isso pode levar alguns minutos…");
                analysisResult = await requestAI([
                    {
                        text: "Analise a página inteira como um sistema de visão e OCR para quadrinhos. Faça uma varredura sistemática, linha por linha, de cima para baixo, identificando TODOS os balões de fala e pensamento com texto legível, inclusive os pequenos e os próximos às bordas. Nesta etapa, apenas extraia os dados; não traduza. Transcreva exatamente cada fala no idioma original. Informe o idioma predominante em detectedLanguage. Para cada balão, estime uma caixa que cubra o interior do balão sem sua cauda: x e y são o canto superior esquerdo, width e height são suas dimensões, como inteiros de 0 a 1000 normalizados pela imagem inteira. Ignore texto fora de balões, desenhos e efeitos sonoros. Não invente texto. Omita somente balões realmente ilegíveis; inclua um item separado para cada balão legível.",
                    },
                    { inlineData: image.inlineData },
                ], analysisSchema, controller, 4096);

                if (requestedPage !== currentPage || controller.signal.aborted) return;
                bubbles = validateExtractedBubbles(analysisResult.bubbles);
                analysisResult = {
                    detectedLanguage: analysisResult.detectedLanguage,
                    bubbles,
                };
                if (image.cacheKey) {
                    pageAnalysisCache.set(image.cacheKey, analysisResult);
                }
            }

            if (requestedPage !== currentPage || controller.signal.aborted) return;
            if (bubbles.length === 0) {
                setTranslationStatus("Nenhum balão legível foi encontrado nesta página.", "error");
                return;
            }

            setTranslationStatus(`Etapa 2/2: ${analysisWasCached ? "usando a análise salva e traduzindo" : "traduzindo"} ${bubbles.length} balões para ${language}…`);
            const translationResult = await requestAI([{
                text: `Traduza integralmente para ${language} cada fala fornecida. O idioma original detectado na página é ${analysisResult.detectedLanguage}. Retorne uma tradução natural e fiel, sem resumir, explicar ou adicionar falas. Preserve exatamente cada id e retorne uma tradução não vazia para todos os itens. Dados: ${JSON.stringify(bubbles.map(({ id, originalText }) => ({ id, originalText })))}`,
            }], translationSchema, controller, Math.min(4096, Math.max(512, bubbles.length * 100)));

            if (requestedPage !== currentPage || controller.signal.aborted) return;
            const translatedBubbles = validateTranslations(translationResult.translations, bubbles);
            if (translationCacheKey) {
                pageTranslationCache.set(translationCacheKey, translatedBubbles);
            }
            displayTranslations(translatedBubbles);
            translateButton.setAttribute("aria-pressed", "true");
            setTranslationStatus(`Página traduzida para ${language}.`, "success");
        } catch (error) {
            if (error.name === "AbortError") {
                if (translationController === controller) {
                    setTranslationStatus("A solicitação passou do limite de 18 minutos e foi cancelada. Tente novamente ou confira a conexão e as chaves dos provedores de IA.", "error");
                }
                return;
            }
            console.error("Falha ao analisar ou traduzir a página:", error);
            setTranslationStatus(error.message || "Não foi possível traduzir a página.", "error");
        } finally {
            window.clearTimeout(requestTimeout);
            if (translationController === controller) {
                translationController = undefined;
                translateButton.disabled = false;
            }
        }
    }

    function closeMenus() {
        topMenu.classList.remove("is-open");
        menuTrigger.setAttribute("aria-expanded", "false");
        resizeMenu.classList.remove("is-open");
        resizeTrigger.setAttribute("aria-expanded", "false");
        readingMenu.classList.remove("is-open");
        readingTrigger.setAttribute("aria-expanded", "false");
    }

    function toggleMenu(menu, trigger) {
        const isOpen = menu.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(isOpen));

        [topMenu, resizeMenu, readingMenu].forEach((otherMenu) => {
            if (otherMenu !== menu) {
                otherMenu.classList.remove("is-open");
                otherMenu.querySelector("button").setAttribute("aria-expanded", "false");
            }
        });
    }

    function setFitMode(mode) {
        reader.classList.remove("fit-standard", "fit-width", "fit-height", "fit-screen");
        if (mode !== "standard") {
            reader.classList.add(`fit-${mode}`);
        }

        document.querySelectorAll("[data-fit]").forEach((button) => {
            button.setAttribute("aria-checked", String(button.dataset.fit === mode));
        });
    }

    menuTrigger.addEventListener("click", () => {
        toggleMenu(topMenu, menuTrigger);
    });

    resizeTrigger.addEventListener("click", () => {
        toggleMenu(resizeMenu, resizeTrigger);
    });

    readingTrigger.addEventListener("click", () => {
        toggleMenu(readingMenu, readingTrigger);
    });

    document.querySelectorAll("[data-fit]").forEach((button) => {
        button.addEventListener("click", () => {
            setFitMode(button.dataset.fit);
            closeMenus();
        });
    });

    readingModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            readingMode = button.dataset.readingMode;
            readingModeButtons.forEach((modeButton) => {
                modeButton.setAttribute("aria-checked", String(modeButton === button));
            });
            closeMenus();
        });
    });

    translateButton.addEventListener("click", () => {
        if (translationLayer) {
            clearTranslationLayer();
            translateButton.setAttribute("aria-pressed", "false");
            setTranslationStatus("Tradução ocultada.");
            return;
        }
        translateCurrentPage();
    });

    translationSettingsButton.addEventListener("click", openTranslationSettings);

    cancelTranslationSettings.addEventListener("click", () => {
        translationDialog.close();
        restoreTranslationSettings();
    });

    translationDialog.addEventListener("cancel", restoreTranslationSettings);

    translationForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const languageChanged = settingsBeforeDialog?.language !== languageSelect.value;
        settingsBeforeDialog = undefined;
        translationDialog.close();

        if (!languageChanged && translationLayer) {
            updateTranslationPresentation();
            setTranslationStatus("Configurações aplicadas.", "success");
            return;
        }

        clearTranslationLayer();
        translateButton.setAttribute("aria-pressed", "false");
        setTranslationStatus("");
        translateCurrentPage();
    });

    capitalizationSelect.addEventListener("change", updateTranslationPresentation);
    fontSelect.addEventListener("change", updateTranslationPresentation);

    document.addEventListener("click", (event) => {
        if (!topMenu.contains(event.target) && !resizeMenu.contains(event.target) && !readingMenu.contains(event.target)) {
            closeMenus();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenus();
            return;
        }

        const isEditableTarget = event.target instanceof HTMLInputElement
            || event.target instanceof HTMLTextAreaElement
            || event.target instanceof HTMLSelectElement
            || event.target.isContentEditable;
        const isScrollArrow = readingMode === "scroll"
            && (event.key === "ArrowDown" || event.key === "ArrowUp");
        if (isEditableTarget
            || (event.target instanceof HTMLAnchorElement)
            || (event.target instanceof HTMLButtonElement && !isScrollArrow)) {
            return;
        }

        if (event.key === "ArrowRight") {
            showPage(currentPage + (readingMode === "manga" ? -1 : 1));
        }
        if (event.key === "ArrowLeft") {
            showPage(currentPage + (readingMode === "manga" ? 1 : -1));
        }
        if (readingMode === "scroll" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            showPage(currentPage + (event.key === "ArrowDown" ? 1 : -1));
        }
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            reader.classList.toggle("is-hidden");
        }
    });

    pageArea.addEventListener("click", (event) => {
        const position = event.clientX / window.innerWidth;
        if (position >= 0.32 && position <= 0.68) {
            reader.classList.toggle("is-hidden");
            closeMenus();
            return;
        }

        if (readingMode === "scroll") return;

        const forwardSide = readingMode === "manga" ? position < 0.32 : position > 0.68;
        const backwardSide = readingMode === "manga" ? position > 0.68 : position < 0.32;
        if (forwardSide) {
            showPage(currentPage + 1);
        } else if (backwardSide) {
            showPage(currentPage - 1);
        }
    });

    let accumulatedScroll = 0;
    let scrollTimeout;
    reader.addEventListener("wheel", (event) => {
        if (readingMode !== "scroll") return;

        event.preventDefault();
        accumulatedScroll += event.deltaY;
        window.clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
            if (accumulatedScroll > 0) showPage(currentPage + 1);
            if (accumulatedScroll < 0) showPage(currentPage - 1);
            accumulatedScroll = 0;
        }, 180);
    }, { passive: false });

    loadPageImages(true);
    window.setInterval(() => loadPageImages(), 5000);

})();
