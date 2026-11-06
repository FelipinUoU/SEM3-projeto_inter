import { createAuthorIcon } from "./authorIcon.js";
import { findSimilarAuthorSuggestions } from "./authorSuggestions.js";
import { apiRequest } from "./apiRequest.js";
import { confirmInPage } from "./confirmationDialog.js";
import { invalidatePublicCatalogCache, loadPublicCatalog } from "./catalogCache.js";
import { setExpandableDescription } from "./expandableDescription.js";
import { account } from "./JAVA/authClient.js";
import { normalizeWorkFormat } from "./workFormat.js";

const adminEmail = "hokupedia@gmail.com";
const imageTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const workGenres = [
    "+18",
    "Ação",
    "Adulto",
    "Apocalipse",
    "Artes marciais",
    "Aventura",
    "Boys Love",
    "Comédia",
    "Crime",
    "Drama",
    "Demônios",
    "Detetive",
    "Doujinshi",
    "Ecchi",
    "Esporte",
    "Família",
    "Fantasia",
    "Ficção científica",
    "Furries",
    "Girls Love",
    "Guerra",
    "Harém",
    "História de Vida",
    "Horror",
    "Isekai",
    "Josei",
    "Magia",
    "Mecha",
    "Mistério",
    "Música",
    "Omegaverso",
    "One Shot",
    "Polícia",
    "Psicológico",
    "Realidade",
    "Realidade virtual",
    "Reencarnação",
    "Regresso",
    "Romance",
    "Seinen",
    "Sobrenatural",
    "Sobrevivência",
    "Shonen",
    "Shoujo",
    "Superpoderes",
    "Tragédia",
    "Universo alternativo",
    "Vampiros",
    "Vida escolar",
    "Yaoi",
    "Yuri"
];
const languageNames = {
    "pt-BR": "Português (Brasil)",
    ja: "Japonês",
    en: "Inglês",
    es: "Espanhol",
    fr: "Francês",
    ko: "Coreano",
    "zh-CN": "Chinês (simplificado)",
    "zh-TW": "Chinês (tradicional)"
};
const languageFlags = {
    "pt-BR": "🇧🇷",
    ja: "🇯🇵",
    en: "🇺🇸",
    es: "🇪🇸",
    fr: "🇫🇷",
    ko: "🇰🇷",
    "zh-CN": "🇨🇳",
    "zh-TW": "🇹🇼"
};
const workList = document.querySelector("#workList");
const editorRegion = document.querySelector("#editorRegion");
const managementPage = document.querySelector(".management-page");
const addWorkButton = document.querySelector("#addWorkButton");
const feedback = document.querySelector("#feedback");
const operationProgressDialog = document.querySelector("#operationProgressDialog");
const operationProgressMessage = document.querySelector("#operationProgressMessage");
const imagePreviewDialog = document.querySelector("#imagePreviewDialog");
const imagePreviewImage = document.querySelector("#imagePreviewImage");
const pageTitle = document.querySelector("#pageTitle");
const workManagementRegion = document.querySelector("#workManagementRegion");
const moderationRequestRegion = document.querySelector("#moderationRequestRegion");
const moderationForm = document.querySelector("#moderationForm");
const requestStatus = document.querySelector("#requestStatus");
const requestStatusTitle = document.querySelector("#requestStatusTitle");
const requestStatusDescription = document.querySelector("#requestStatusDescription");
const retryModerationButton = document.querySelector("#retryModerationButton");
const requestFeedback = document.querySelector("#requestFeedback");
let works = [];
let catalogWorks = [];
let currentEditingWorkId = "";
let workRequests = [];
let selectedArchive;
let selectedArchivePages;
let selectedChapterImages = [];
let selectedChapterExistingPages = [];
let selectedCoverFile;
const pendingChapterSubmissions = new WeakSet();
let coverPreviewUrl;
let isAdmin = false;
let currentUserId = "";
let currentUserName = "";
let workRequestPolling;
let isRefreshingWorkRequest = false;

function getDeleteErrorMessage(error, resource) {
    if (error.status === 401) return "Sua sessão expirou. Faça login novamente antes de excluir.";
    if (error.status === 403) {
        return resource === "obra"
            ? "Você só pode excluir obras próprias; somente o administrador pode excluir obras de outras contas."
            : "Você não tem permissão para cancelar ou excluir este pedido.";
    }
    if (error.status === 404) return "O registro não foi encontrado. Atualize a página e tente novamente.";
    if (error.status === 409) return error.message;
    return error.message || `Não foi possível excluir ${resource}.`;
}

async function uploadImage(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const contentType = imageTypes.has(file.type) ? file.type : ({
        avif: "image/avif",
        gif: "image/gif",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp"
    })[extension];
    if (!contentType) throw new Error("Selecione uma imagem JPG, PNG, GIF, WEBP ou AVIF.");
    return apiRequest(`/api/uploads?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file,
        authenticated: true
    });
}

async function uploadWorkRequestCover(file) {
    return apiRequest(`/api/uploads/work-request-cover?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        authenticated: true
    });
}

async function uploadChapterArchive(file) {
    return apiRequest(`/api/uploads/chapter-archive?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
        authenticated: true
    });
}

document.addEventListener("click", (event) => {
    const previewButton = event.target.closest("button[data-image-preview-url]");
    if (previewButton) {
        imagePreviewImage.src = previewButton.dataset.imagePreviewUrl;
        imagePreviewImage.alt = previewButton.getAttribute("aria-label") || "Imagem do capítulo";
        imagePreviewDialog.showModal();
        return;
    }
    if (event.target.closest(".image-preview-close") || event.target === imagePreviewDialog) {
        imagePreviewDialog.close();
    }
});

async function loadCatalogWorks() {
    try {
        const data = await loadPublicCatalog();
        catalogWorks = data.works;
    } catch (error) {
        console.error("Não foi possível carregar o catálogo de autores:", error);
    }
}

async function loadWorks() {
    void loadCatalogWorks();
    const data = await apiRequest("/api/management/works", { authenticated: true });
    if (!Array.isArray(data.works)) {
        throw new Error("A resposta do Neon PostgreSQL contém uma lista de obras inválida.");
    }
    works = data.works;
    for (const work of works) {
        for (const genre of getSelectedValues(work.gender)) {
            if (!workGenres.includes(genre)) workGenres.push(genre);
        }
        for (const chapter of work.chapters || []) {
            if (chapter.language && !languageNames[chapter.language]) {
                languageNames[chapter.language] = chapter.language;
            }
        }
    }
    renderWorks();
}

async function loadWorkRequest() {
    const data = await apiRequest("/api/pedido_obra/me", { authenticated: true });
    if (!Array.isArray(data.requests)) {
        throw new Error("A resposta do servidor contém uma lista de pedidos de obra inválida.");
    }
    workRequests = data.requests;
    renderWorks();
    if (!workRequests.some((request) => request.status?.toUpperCase() === "PENDENTE")) {
        stopWorkRequestPolling();
    } else {
        startWorkRequestPolling();
    }
    if (workRequests.some((request) => (
        request.status?.toUpperCase() === "APROVADO"
        && !works.some((work) => work.id === request.id)
    ))) {
        await loadWorks();
    }
}

function startWorkRequestPolling() {
    if (workRequestPolling) return;
    workRequestPolling = window.setInterval(() => {
        if (isRefreshingWorkRequest) return;
        isRefreshingWorkRequest = true;
        void loadWorkRequest()
            .catch((error) => {
                console.error("Não foi possível atualizar o status do pedido de obra:", error);
            })
            .finally(() => {
                isRefreshingWorkRequest = false;
            });
    }, 15000);
}

function stopWorkRequestPolling() {
    if (!workRequestPolling) return;
    window.clearInterval(workRequestPolling);
    workRequestPolling = undefined;
}

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

function showOperationProgress(message) {
    operationProgressMessage.textContent = message;
    if (!operationProgressDialog.open) operationProgressDialog.showModal();
}

function closeOperationProgress() {
    if (operationProgressDialog.open) operationProgressDialog.close();
}

operationProgressDialog.addEventListener("cancel", (event) => event.preventDefault());

function createButton(label, action, className, title = label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    return button;
}

function getChapterNumber(chapter, index) {
    return Number.isInteger(chapter.number) && chapter.number > 0 ? chapter.number : index + 1;
}

function getChapterDisplayName(chapter, index) {
    const title = typeof chapter.title === "string" ? chapter.title.trim() : "";
    return `Capítulo ${getChapterNumber(chapter, index)}${title ? ` — ${title}` : ""}`;
}

function renderWorkCard(work) {
    const canManageWork = work.createBy === currentUserId;
    const card = document.createElement("article");
    card.className = "work-card";
    card.dataset.workId = work.id;

    const cover = document.createElement("div");
    cover.className = "work-cover";
    if (work.cover) {
        const coverImage = document.createElement("img");
        coverImage.src = work.cover;
        coverImage.alt = `Capa de ${work.title}`;
        cover.append(coverImage);
    } else {
        cover.setAttribute("aria-hidden", "true");
        cover.textContent = "HOKU PÉDIA";
    }
    card.append(cover);

    const details = document.createElement("div");
    details.className = "work-details";

    const title = document.createElement("h2");
    title.className = "work-title";
    title.textContent = work.title;
    details.append(title);

    const description = document.createElement("p");
    description.className = "work-description";
    details.append(description);
    setExpandableDescription(description, work.description || "Sem descrição.");

    const actions = document.createElement("div");
    actions.className = "work-actions";
    const hubLink = document.createElement("a");
    hubLink.className = "text-action hub-action";
    hubLink.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
    hubLink.textContent = "Ver Obra";
    actions.append(hubLink);
    if (canManageWork) {
        actions.append(
            createButton("✎ Editar", "edit-work", "text-action edit-action"),
            createButton("⊕ Novo Capítulo", "add-chapter", "text-action chapter-action")
        );
    }
    details.append(actions);
    card.append(details);

    if (canManageWork || isAdmin) {
        card.append(createButton("×", "delete-work", "icon-action delete-action", `Excluir obra ${work.title}`));
    }

    const chapterList = document.createElement("div");
    chapterList.className = "work-chapters";
    if (!canManageWork) {
        chapterList.hidden = true;
    } else if (work.chapters.length === 0) {
        const empty = document.createElement("p");
        empty.className = "no-chapters";
        empty.textContent = "Sem Capítulos";
        chapterList.append(empty);
    } else {
        const hasCollapsedChapters = work.chapters.length > 1;
        for (const [index, chapter] of work.chapters.entries()) {
            const row = document.createElement("div");
            row.className = "chapter-row";
            if (hasCollapsedChapters && index > 0) {
                row.dataset.extraChapter = "true";
                row.hidden = true;
            }

            const flag = document.createElement("span");
            flag.textContent = languageFlags[chapter.language] || "🌐";
            flag.setAttribute("aria-label", languageNames[chapter.language] || "Idioma");
            row.append(flag);

            const chapterTitle = document.createElement("span");
            chapterTitle.className = "chapter-row-title";
            chapterTitle.textContent = getChapterDisplayName(chapter, index);
            row.append(chapterTitle);

            const chapterAuthor = document.createElement("span");
            chapterAuthor.className = "chapter-row-author";
            chapterAuthor.append(createAuthorIcon());
            const authorName = document.createElement("span");
            authorName.textContent = chapter.authorName || chapter.author || "Usuário desconhecido";
            chapterAuthor.append(authorName);
            row.append(chapterAuthor);

            if (chapter.createBy === currentUserId) {
                row.append(
                    createButton("Editar", "edit-chapter", "chapter-row-action edit-chapter-action", `Editar ${getChapterDisplayName(chapter, index)}`),
                    createButton("Excluir", "delete-chapter", "chapter-row-action delete-chapter-action", `Excluir ${getChapterDisplayName(chapter, index)}`)
                );
            }
            row.dataset.chapterId = chapter.id;
            chapterList.append(row);
        }
        if (hasCollapsedChapters) {
            const toggle = createButton(
                "",
                "toggle-chapters",
                "chapter-list-toggle",
                `Mostrar todos os ${work.chapters.length} capítulos de ${work.title}`
            );
            toggle.setAttribute("aria-expanded", "false");
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("aria-hidden", "true");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "m6 9 6 6 6-6");
            icon.append(path);
            toggle.append(icon);
            chapterList.append(toggle);
        }
    }
    const chapterEditorRegion = document.createElement("section");
    chapterEditorRegion.className = "editor-region chapter-editor-region";
    chapterEditorRegion.dataset.workId = work.id;
    chapterEditorRegion.setAttribute("aria-live", "polite");
    const workEditorRegion = document.createElement("section");
    workEditorRegion.className = "editor-region work-editor-region";
    workEditorRegion.dataset.workId = work.id;
    workEditorRegion.setAttribute("aria-live", "polite");
    card.append(workEditorRegion, chapterList, chapterEditorRegion);
    return card;
}

function renderWorkRequestCard(request) {
    const isRejected = request.status?.toUpperCase() === "REPROVADO";
    const card = document.createElement("article");
    card.className = `work-request-card${isRejected ? " is-rejected" : ""}`;
    card.dataset.requestId = request.id;

    const badge = document.createElement("span");
    badge.className = "work-request-card-status";
    badge.textContent = isRejected ? "Negada" : "Em análise";

    const details = document.createElement("div");
    const heading = document.createElement("h2");
    heading.textContent = isRejected ? "Sua obra foi negada." : "Obra em análise.";
    const description = document.createElement("p");
    description.textContent = isRejected
        ? "O administrador não aprovou este pedido. Você pode enviar outra obra pelo botão acima."
        : "O administrador analisará este pedido. Enquanto isso, você pode adicionar outra obra.";
    const title = document.createElement("p");
    title.className = "work-request-title";
    title.textContent = request.title || "Obra sem título";
    const metadata = document.createElement("p");
    metadata.textContent = [
        request.formato ? request.formato.toUpperCase() : "",
        request.gender || ""
    ].filter(Boolean).join(" · ");
    const deleteButton = document.createElement("button");
    deleteButton.className = "work-request-delete";
    deleteButton.type = "button";
    deleteButton.dataset.requestAction = "delete";
    deleteButton.setAttribute(
        "aria-label",
        isRejected ? `Excluir pedido negado de ${request.title}` : `Cancelar análise de ${request.title}`
    );
    deleteButton.title = isRejected ? "Excluir pedido negado" : "Cancelar análise";
    deleteButton.textContent = "×";
    details.append(heading, description, title);
    if (metadata.textContent) details.append(metadata);
    card.append(badge, details, deleteButton);
    return card;
}

function renderWorks() {
    workList.replaceChildren();
    const visibleRequests = workRequests.filter((request) => (
        ["PENDENTE", "REPROVADO"].includes(request.status?.toUpperCase())
    ));
    if (works.length === 0 && visibleRequests.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-works";
        empty.textContent = isAdmin
            ? "Nenhuma obra cadastrada. Use “Adicionar Obra” para começar."
            : "Você ainda não tem obras para gerenciar.";
        workList.append(empty);
        return;
    }
    for (const request of visibleRequests) {
        workList.append(renderWorkRequestCard(request));
    }
    for (const work of works) workList.append(renderWorkCard(work));
}

function getKnownWorksForAuthorSuggestions() {
    const itemsById = new Map();
    for (const work of catalogWorks) {
        if (work?.id) itemsById.set(work.id, work);
    }
    for (const work of works) {
        if (work?.id) itemsById.set(work.id, work);
    }
    for (const request of workRequests) {
        if (request?.id && request.status?.toUpperCase() !== "REPROVADO" && request.author) {
            itemsById.set(request.id, request);
        }
    }
    return [...itemsById.values()];
}

function formatAuthorWorksSubtitle(titles) {
    if (!Array.isArray(titles) || titles.length === 0) {
        return "Sugestão para outra obra do mesmo autor";
    }
    return `Sugestão para outra obra do mesmo autor de: ${titles.join(", ")}`;
}

function createAuthorField(initialValue = "", currentWorkId = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "field author-field";

    const label = document.createElement("label");
    label.className = "author-field-label";
    label.htmlFor = "workAuthor";
    label.textContent = "Autor";

    const inputContainer = document.createElement("div");
    inputContainer.className = "author-input-container";

    const input = document.createElement("input");
    input.id = "workAuthor";
    input.name = "author";
    input.type = "text";
    input.value = initialValue;
    input.placeholder = "Nome do autor";
    input.required = true;
    input.autocomplete = "off";
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "workAuthorSuggestions");
    input.setAttribute("aria-expanded", "false");

    const suggestions = document.createElement("div");
    suggestions.className = "author-suggestions";
    suggestions.id = "workAuthorSuggestions";
    suggestions.setAttribute("role", "listbox");
    suggestions.setAttribute("aria-label", "Sugestões de autores com nome parecido");
    suggestions.hidden = true;

    const sameAuthorNotice = document.createElement("p");
    sameAuthorNotice.className = "author-same-work-notice";
    sameAuthorNotice.hidden = true;

    let activeIndex = -1;

    const closeSuggestions = () => {
        suggestions.hidden = true;
        input.setAttribute("aria-expanded", "false");
        activeIndex = -1;
    };

    const updateSuggestions = (openDropdown = true) => {
        const matches = findSimilarAuthorSuggestions(
            input.value,
            getKnownWorksForAuthorSuggestions(),
            { excludeWorkId: currentWorkId }
        );
        const exactMatch = matches.find((item) => item.isExactMatch);
        if (exactMatch && exactMatch.works.length > 0) {
            sameAuthorNotice.textContent = `Outra obra do mesmo autor de: ${exactMatch.works.join(", ")}`;
            sameAuthorNotice.hidden = false;
        } else {
            sameAuthorNotice.textContent = "";
            sameAuthorNotice.hidden = true;
        }

        const selectableMatches = matches.filter((item) => !item.isExactMatch);
        suggestions.replaceChildren();
        activeIndex = -1;

        if (!openDropdown || selectableMatches.length === 0) {
            closeSuggestions();
            return;
        }

        for (const match of selectableMatches) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "author-suggestion-option";
            option.setAttribute("role", "option");

            const header = document.createElement("span");
            header.className = "author-suggestion-header";

            const name = document.createElement("strong");
            name.className = "author-suggestion-name";
            name.textContent = match.author;

            const badge = document.createElement("span");
            badge.className = "author-suggestion-badge";
            badge.textContent = "Mesmo autor";

            header.append(name, badge);

            const subtitle = document.createElement("span");
            subtitle.className = "author-suggestion-works";
            subtitle.textContent = formatAuthorWorksSubtitle(match.works);

            option.append(header, subtitle);
            option.addEventListener("mousedown", (event) => {
                event.preventDefault();
            });
            option.addEventListener("click", () => {
                input.value = match.author;
                closeSuggestions();
                updateSuggestions(false);
                input.focus();
            });
            suggestions.append(option);
        }

        suggestions.hidden = false;
        input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("input", () => updateSuggestions(true));
    input.addEventListener("focus", () => {
        if (input.value.trim().length >= 2) updateSuggestions(true);
    });
    input.addEventListener("blur", () => {
        closeSuggestions();
    });
    input.addEventListener("keydown", (event) => {
        const options = [...suggestions.querySelectorAll(".author-suggestion-option")];
        if (event.key === "Escape") {
            closeSuggestions();
            return;
        }
        if (suggestions.hidden || options.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % options.length;
            options.forEach((opt, idx) => opt.classList.toggle("is-active", idx === activeIndex));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + options.length) % options.length;
            options.forEach((opt, idx) => opt.classList.toggle("is-active", idx === activeIndex));
        } else if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
            event.preventDefault();
            options[activeIndex].click();
        }
    });

    updateSuggestions(false);
    inputContainer.append(input, suggestions);
    wrapper.append(label, inputContainer, sameAuthorNotice);
    return wrapper;
}

function createField({ id, label, name, value = "", type = "text", placeholder = "", required = false }) {
    if (id === "workAuthor") return createAuthorField(value, currentEditingWorkId);
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    wrapper.htmlFor = id;
    wrapper.append(document.createTextNode(label));

    const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    input.id = id;
    input.name = name;
    input.value = value;
    input.placeholder = placeholder;
    input.required = required;
    if (type !== "textarea") input.type = type;
    wrapper.append(input);
    return wrapper;
}

function createWorkFormatField(selected = "") {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    wrapper.htmlFor = "workFormat";
    wrapper.append(document.createTextNode("Formato"));

    const select = document.createElement("select");
    select.id = "workFormat";
    select.name = "formato";
    select.required = true;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione o formato";
    placeholder.disabled = true;
    placeholder.selected = !selected;
    select.append(placeholder);

    for (const [value, label] of [
        ["hq", "HQs"],
        ["manhwa", "Manhwas"],
        ["manga", "Mangás"]
    ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = selected === value;
        select.append(option);
    }

    wrapper.append(select);
    return wrapper;
}

function getSelectedValues(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(/[,;]/).map((item) => item.trim()).filter(Boolean);
}

function createGenreTagField(selected = []) {
    const wrapper = document.createElement("div");
    wrapper.className = "field genre-field";
    const heading = document.createElement("div");
    heading.className = "genre-field-heading";
    const label = document.createElement("span");
    label.className = "genre-field-label";
    label.textContent = "Categorias";
    const tagList = document.createElement("div");
    tagList.className = "genre-tag-list";
    tagList.setAttribute("role", "group");
    tagList.setAttribute("aria-label", "Categorias da obra");
    tagList.id = "workGenreOptions";
    const toggle = document.createElement("button");
    toggle.className = "genre-dropdown-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", tagList.id);
    toggle.setAttribute("aria-label", "Mostrar todas as categorias");
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("aria-hidden", "true");
    const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chevronPath.setAttribute("d", "m6 9 6 6 6-6");
    chevron.append(chevronPath);
    toggle.append(chevron);
    heading.append(label);
    const updateCollapsedTags = () => {
        const tags = [...tagList.querySelectorAll("button[data-genre]")];
        for (const tag of tags) tag.classList.remove("is-overflow-hidden");
        if (toggle.getAttribute("aria-expanded") === "true" || !tagList.clientWidth) return;

        const gap = Number.parseFloat(getComputedStyle(tagList).columnGap) || 0;
        const availableWidth = tagList.clientWidth;
        const toggleWidth = toggle.getBoundingClientRect().width;
        let usedWidth = 0;
        let visibleCount = 0;

        for (const tag of tags) {
            const tagWidth = tag.getBoundingClientRect().width;
            const nextWidth = usedWidth + (visibleCount ? gap : 0) + tagWidth;
            if (nextWidth + gap + toggleWidth > availableWidth) break;
            usedWidth = nextWidth;
            visibleCount += 1;
        }

        for (const tag of tags.slice(visibleCount)) {
            tag.classList.add("is-overflow-hidden");
        }
    };
    const genreResizeObserver = new ResizeObserver(updateCollapsedTags);
    genreResizeObserver.observe(tagList);
    const selectedValues = new Set(selected);
    const input = document.createElement("input");
    input.type = "hidden";
    input.id = "workGender";
    input.name = "gender";
    input.value = [...selectedValues].join(", ");

    toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute(
            "aria-label",
            expanded ? "Recolher categorias" : "Mostrar todas as categorias"
        );
        tagList.classList.toggle("is-expanded", expanded);
        wrapper.classList.toggle("is-expanded", expanded);
        updateCollapsedTags();
    });

    const updateTagIcon = (tag, isSelected) => {
        tag.replaceChildren();
        if (isSelected) {
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("aria-hidden", "true");
            const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
            check.setAttribute("d", "m5 12 4 4L19 6");
            icon.append(check);
            tag.append(icon);
        }
        tag.append(document.createTextNode(tag.dataset.genre));
    };

    for (const genre of workGenres) {
        const tag = document.createElement("button");
        tag.className = "genre-tag";
        tag.type = "button";
        tag.dataset.genre = genre;
        tag.setAttribute("aria-pressed", String(selectedValues.has(genre)));
        updateTagIcon(tag, selectedValues.has(genre));
        tagList.append(tag);
    }
    tagList.append(toggle);

    tagList.addEventListener("click", (event) => {
        const tag = event.target.closest("button[data-genre]");
        if (!tag) return;
        const isSelected = tag.getAttribute("aria-pressed") === "true";
        tag.setAttribute("aria-pressed", String(!isSelected));
        tag.classList.toggle("is-selected", !isSelected);
        updateTagIcon(tag, !isSelected);
        updateCollapsedTags();
        const selectedGenres = [...tagList.querySelectorAll("button[data-genre][aria-pressed='true']")]
            .map((item) => item.dataset.genre);
        input.value = selectedGenres.join(", ");
    });

    for (const tag of tagList.querySelectorAll("button[data-genre]")) {
        tag.classList.toggle("is-selected", tag.getAttribute("aria-pressed") === "true");
    }
    wrapper.append(heading, tagList, input);
    const hint = document.createElement("small");
    hint.className = "field-hint";
    hint.textContent = "Selecione uma ou mais categorias.";
    wrapper.append(hint);
    return wrapper;
}

function renderWorkForm(work, targetRegion = editorRegion) {
    currentEditingWorkId = work?.id || "";
    const isEditing = Boolean(work);
    const isRequest = !isAdmin && !isEditing;
    const panel = createEditorPanel(isEditing ? "Editar Obra" : isRequest ? "Solicitar nova obra" : "Adicionar Obra");
    panel.classList.add("work-creation-panel");
    const form = document.createElement("form");
    form.className = "editor-form work-creation-form";
    form.dataset.formType = "work";
    form.dataset.workId = work?.id || "";
    const layout = document.createElement("div");
    layout.className = "work-form-layout";
    const coverLabel = document.createElement("label");
    coverLabel.className = "work-cover-upload";
    coverLabel.htmlFor = "workCover";
    coverLabel.setAttribute("aria-label", "Selecionar imagem de capa da obra");
    coverLabel.classList.toggle("has-cover", Boolean(work?.cover || coverPreviewUrl));
    const coverPreview = document.createElement("img");
    coverPreview.className = "work-cover-preview";
    coverPreview.alt = work?.cover ? `Pré-visualização da capa de ${work.title}` : "";
    if (coverPreviewUrl) {
        coverPreview.src = coverPreviewUrl;
    } else if (work?.cover) {
        coverPreview.src = work.cover;
    }
    const coverPrompt = document.createElement("span");
    coverPrompt.className = "work-cover-prompt";
    coverPrompt.textContent = work?.cover || coverPreviewUrl ? "Trocar capa" : "Clique para\nAdicionar Capa";
    coverLabel.append(coverPreview, coverPrompt);
    const coverInput = document.createElement("input");
    coverInput.className = "file-input";
    coverInput.id = "workCover";
    coverInput.name = "cover";
    coverInput.type = "file";
    coverInput.accept = [...imageTypes].join(",");
    coverInput.required = !work?.cover;

    const fields = document.createElement("div");
    fields.className = "work-form-fields";
    fields.append(createField({
        id: "workName",
        label: "Nome",
        name: "title",
        value: work?.title || "",
        placeholder: "Ex.: Naruto",
        required: true
    }));
    fields.append(createField({
        id: "workAuthor",
        label: "Autor",
        name: "author",
        value: work?.author || "",
        placeholder: "Nome do autor",
        required: true
    }));
    fields.append(
        createWorkFormatField(normalizeWorkFormat(work?.formato)),
        createGenreTagField(getSelectedValues(work?.gender))
    );
    layout.append(coverLabel, coverInput, fields);
    form.append(layout,
        createField({
            id: "workDescription",
            label: "Sinopse",
            name: "description",
            value: work?.description || "",
            type: "textarea",
            placeholder: "Apresente a obra"
        }),
        createFormActions(isRequest ? "Enviar para homologação" : "Salvar", true)
    );
    managementPage.classList.add("has-work-creation-form");

    coverInput.addEventListener("change", () => {
        const [file] = coverInput.files;
        if (!file) return;
        if (!imageTypes.has(file.type)) {
            coverInput.value = "";
            showFeedback(`O arquivo “${file.name}” não é uma imagem compatível.`, true);
            return;
        }
        selectedCoverFile = file;
        if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
        coverPreviewUrl = URL.createObjectURL(file);
        coverPreview.src = coverPreviewUrl;
        coverPreview.alt = `Pré-visualização da capa ${file.name}`;
        coverPrompt.textContent = "Trocar capa";
        coverLabel.classList.add("has-cover");
        showFeedback("");
    });

    panel.append(form);
    targetRegion.replaceChildren(panel);
    document.querySelector("#workName").focus();
}

function createLanguageSelect(selected = "pt-BR") {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    wrapper.htmlFor = "chapterLanguage";
    wrapper.append(document.createTextNode("Idioma"));

    const select = document.createElement("select");
    select.id = "chapterLanguage";
    select.name = "language";
    select.required = true;
    for (const [value, label] of Object.entries(languageNames)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === selected;
        select.append(option);
    }
    wrapper.append(select);
    return wrapper;
}

function renderChapterForm(work, chapter, targetRegion) {
    selectedArchive = undefined;
    selectedArchivePages = undefined;
    selectedChapterImages = [];
    selectedChapterExistingPages = (chapter?.pages || []).map((page) => {
        if (typeof page === "string") {
            return { name: "Página", url: page, fileId: "", format: "" };
        }
        return {
            ...page,
            name: page.name || page.originalName || "Página",
            url: page.url || page.imageUrl || "",
            fileId: page.fileId || page.imageFileId || ""
        };
    });

    const panel = createEditorPanel(chapter ? "Editar Capítulo" : `Novo Capítulo — ${work.title}`);
    const form = document.createElement("form");
    form.className = "editor-form";
    form.dataset.formType = "chapter";
    form.dataset.workId = work.id;
    form.dataset.chapterId = chapter?.id || "";

    const chapterIndex = chapter ? work.chapters.findIndex((item) => item.id === chapter.id) : -1;
    const suggestedNumber = chapter
        ? getChapterNumber(chapter, chapterIndex)
        : work.chapters.reduce((highest, item, index) => Math.max(highest, getChapterNumber(item, index)), 0) + 1;
    const chapterFields = document.createElement("div");
    chapterFields.className = "form-row chapter-fields-row";
    const numberField = createField({
        id: "chapterNumber",
        label: "Número do capítulo",
        name: "number",
        value: String(suggestedNumber),
        type: "number",
        required: true
    });
    numberField.querySelector("input").min = "1";
    numberField.querySelector("input").step = "1";
    chapterFields.append(numberField);
    chapterFields.append(createField({
        id: "chapterName",
        label: "Nome do capítulo (opcional)",
        name: "title",
        value: chapter?.title || "",
        placeholder: "Ex.: O início da jornada"
    }));
    form.append(chapterFields);

    const row = document.createElement("div");
    row.className = "form-row chapter-language-row";
    row.append(createLanguageSelect(chapter?.language || "pt-BR"));
    form.append(row);

    const uploadArea = document.createElement("div");
    uploadArea.className = "chapter-page-upload";
    const uploadLabel = document.createElement("label");
    uploadLabel.className = "chapter-page-add";
    uploadLabel.htmlFor = "chapterPages";
    const uploadIcon = document.createElement("span");
    uploadIcon.setAttribute("aria-hidden", "true");
    uploadIcon.textContent = "↑";
    uploadLabel.append(uploadIcon);
    const uploadStrong = document.createElement("strong");
    uploadStrong.textContent = "Clique para adicionar";
    uploadLabel.append(uploadStrong);

    const fileInput = document.createElement("input");
    fileInput.className = "file-input";
    fileInput.id = "chapterPages";
    fileInput.name = "chapterPages";
    fileInput.type = "file";
    fileInput.accept = ".zip,application/zip,application/x-zip-compressed,image/avif,image/gif,image/jpeg,image/png,image/webp";
    fileInput.multiple = true;
    uploadLabel.append(fileInput);

    const gallery = document.createElement("div");
    gallery.className = "chapter-page-gallery";
    const formatsHint = document.createElement("p");
    formatsHint.className = "chapter-page-formats";
    formatsHint.textContent = "Formatos aceitos: JPG, PNG, GIF, WEBP, AVIF e ZIP.";
    const pageStrip = document.createElement("div");
    pageStrip.className = "chapter-page-strip";
    pageStrip.setAttribute("role", "list");
    pageStrip.setAttribute("aria-label", "Imagens do capítulo");
    const selectedFilesLabel = document.createElement("p");
    selectedFilesLabel.className = "selected-files chapter-page-status";
    selectedFilesLabel.setAttribute("role", "status");
    gallery.append(formatsHint, pageStrip, selectedFilesLabel);
    uploadArea.append(uploadLabel, gallery);
    form.append(uploadArea, createFormActions(chapter ? "Salvar" : "Adicionar capítulo"));

    function renderChapterPages() {
        pageStrip.replaceChildren();
        const pages = selectedChapterExistingPages.map((page, index) => ({
            ...page,
            source: "existing",
            index
        })).concat(selectedChapterImages.map((image, index) => ({
            name: image.file.name,
            url: image.previewUrl,
            source: "selected",
            index
        })));

        for (const page of pages) {
            const card = document.createElement("figure");
            card.className = "page-preview";
            card.setAttribute("role", "listitem");
            const openButton = document.createElement("button");
            openButton.className = "page-preview-open";
            openButton.type = "button";
            openButton.dataset.imagePreviewUrl = page.url;
            openButton.setAttribute("aria-label", `Visualizar ${page.name}`);
            const image = document.createElement("img");
            image.src = page.url;
            image.alt = page.name;
            openButton.append(image);
            card.append(openButton);

            const removeButton = document.createElement("button");
            removeButton.className = "page-preview-remove";
            removeButton.type = "button";
            removeButton.dataset.removePage = page.source;
            removeButton.dataset.pageIndex = String(page.index);
            removeButton.setAttribute("aria-label", `Remover ${page.name}`);
            removeButton.textContent = "×";
            card.append(removeButton);

            const caption = document.createElement("figcaption");
            caption.textContent = page.name;
            card.append(caption);
            pageStrip.append(card);
        }

        if (selectedArchive) {
            const archiveCard = document.createElement("figure");
            archiveCard.className = "page-preview page-preview-archive";
            archiveCard.setAttribute("role", "listitem");
            const archiveName = document.createElement("span");
            archiveName.className = "page-preview-archive-icon";
            archiveName.setAttribute("aria-hidden", "true");
            archiveName.textContent = "ZIP";
            archiveCard.append(archiveName);
            const removeArchive = document.createElement("button");
            removeArchive.className = "page-preview-remove";
            removeArchive.type = "button";
            removeArchive.dataset.removePage = "archive";
            removeArchive.setAttribute("aria-label", `Remover arquivo ${selectedArchive.name}`);
            removeArchive.textContent = "×";
            archiveCard.append(removeArchive);
            const caption = document.createElement("figcaption");
            caption.textContent = selectedArchive.name;
            archiveCard.append(caption);
            pageStrip.append(archiveCard);
        }

        const pageCount = selectedChapterExistingPages.length + selectedChapterImages.length;
        selectedFilesLabel.textContent = selectedArchive
            ? `ZIP selecionado: ${selectedArchive.name}. As páginas serão adicionadas ao capítulo.`
            : pageCount
                ? `${pageCount} ${pageCount === 1 ? "imagem pronta" : "imagens prontas"} para o capítulo.`
                : "Nenhuma imagem selecionada. Adicione imagens ou um arquivo ZIP.";
    }

    function addChapterFiles(files) {
        if (files.length === 0) return;
        const zipFiles = files.filter((file) => file.name.toLowerCase().endsWith(".zip"));
        if (zipFiles.length > 0) {
            if (files.length !== 1 || zipFiles.length !== 1 || selectedChapterImages.length > 0) {
                showFeedback("Adicione um único ZIP por vez, sem misturá-lo com imagens.", true);
                return;
            }
            selectedArchive = zipFiles[0];
            selectedArchivePages = undefined;
        } else {
            if (selectedArchive) {
                showFeedback("Remova o ZIP selecionado antes de adicionar imagens avulsas.", true);
                return;
            }
            if (files.some((file) => !imageTypes.has(file.type) && !/\.(avif|gif|jpe?g|png|webp)$/i.test(file.name))) {
                showFeedback("Selecione imagens JPG, PNG, GIF, WEBP ou AVIF.", true);
                return;
            }
            selectedChapterImages.push(...files.map((file) => ({
                file,
                previewUrl: URL.createObjectURL(file),
                uploadedPage: undefined
            })));
        }
        showFeedback("");
        renderChapterPages();
    }

    fileInput.addEventListener("change", () => {
        addChapterFiles([...fileInput.files]);
        fileInput.value = "";
    });

    pageStrip.addEventListener("click", (event) => {
        const removeButton = event.target.closest("button[data-remove-page]");
        if (!removeButton) return;
        const { removePage, pageIndex } = removeButton.dataset;
        if (removePage === "archive") {
            selectedArchive = undefined;
            selectedArchivePages = undefined;
        } else if (removePage === "existing") {
            selectedChapterExistingPages.splice(Number(pageIndex), 1);
        } else if (removePage === "selected") {
            const [removed] = selectedChapterImages.splice(Number(pageIndex), 1);
            if (removed) URL.revokeObjectURL(removed.previewUrl);
        }
        renderChapterPages();
    });

    uploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        uploadArea.classList.add("is-dragging");
    });
    uploadArea.addEventListener("dragleave", (event) => {
        if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove("is-dragging");
    });
    uploadArea.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadArea.classList.remove("is-dragging");
        addChapterFiles([...(event.dataTransfer?.files || [])]);
    });

    renderChapterPages();
    panel.append(form);
    targetRegion.replaceChildren(panel);
    document.querySelector("#chapterNumber").focus();
}

function createEditorPanel(title) {
    const panel = document.createElement("section");
    panel.className = "editor-panel";
    const heading = document.createElement("div");
    heading.className = "editor-heading";
    const headingText = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Gerenciar conteúdo";
    const titleElement = document.createElement("h2");
    titleElement.textContent = title;
    headingText.append(eyebrow, titleElement);
    heading.append(headingText, createButton("×", "close-editor", "editor-close", "Fechar formulário"));
    panel.append(heading);
    return panel;
}

function createFormActions(saveLabel = "Salvar", isWorkForm = false) {
    const actions = document.createElement("div");
    actions.className = "form-actions";
    actions.append(
        createButton("Cancelar", "close-editor", "cancel-button"),
        createButton(saveLabel, "submit-form", "submit-button")
    );
    if (isWorkForm) {
        const [cancelButton, saveButton] = actions.querySelectorAll("button");
        cancelButton.classList.add("work-form-cancel");
        saveButton.classList.add("work-form-save");
        const cancelIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        cancelIcon.setAttribute("viewBox", "0 0 24 24");
        cancelIcon.setAttribute("aria-hidden", "true");
        const cancelPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        cancelPath.setAttribute("d", "M7 7l10 10M17 7 7 17M4 4v16h16V4z");
        cancelIcon.append(cancelPath);
        const saveIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        saveIcon.setAttribute("viewBox", "0 0 24 24");
        saveIcon.setAttribute("aria-hidden", "true");
        const savePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        savePath.setAttribute("d", "M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8");
        saveIcon.append(savePath);
        cancelButton.prepend(cancelIcon);
        saveButton.prepend(saveIcon);
    }
    return actions;
}

function closeEditor() {
    selectedArchive = undefined;
    selectedArchivePages = undefined;
    selectedChapterImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    selectedChapterImages = [];
    selectedChapterExistingPages = [];
    selectedCoverFile = undefined;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = undefined;
    managementPage.classList.remove("has-work-creation-form");
    editorRegion.replaceChildren();
    workList.querySelectorAll(".chapter-editor-region, .work-editor-region")
        .forEach((region) => region.replaceChildren());
}

function setEditor(type, workId, chapterId = null) {
    const work = works.find((item) => item.id === workId);
    if (type === "chapter" && !work) {
        showFeedback("Selecione uma obra válida antes de adicionar um capítulo.", true);
        return;
    }
    closeEditor();
    showFeedback("");

    if (type === "work" && !workId) {
        renderWorkForm(work);
        return;
    }
    if (type === "work") {
        const workEditorRegion = workList.querySelector(
            `.work-editor-region[data-work-id="${CSS.escape(work.id)}"]`
        );
        if (!workEditorRegion) {
            showFeedback("Não foi possível abrir o editor desta obra.", true);
            return;
        }
        renderWorkForm(work, workEditorRegion);
        return;
    }
    const chapter = chapterId
        ? work.chapters.find((item) => item.id === chapterId)
        : null;
    const chapterEditorRegion = workList.querySelector(
        `.chapter-editor-region[data-work-id="${CSS.escape(work.id)}"]`
    );
    if (!chapterEditorRegion) {
        showFeedback("Não foi possível abrir o editor do capítulo desta obra.", true);
        return;
    }
    renderChapterForm(work, chapter, chapterEditorRegion);
}

async function handleWorkSubmit(form) {
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    if (!title) {
        showFeedback("Informe o nome da obra.", true);
        return;
    }
    const workId = form.dataset.workId;
    const existing = works.find((work) => work.id === workId);
    let cover = existing?.cover || "";
    let coverFileId = existing?.coverFileId || "";
    if (selectedCoverFile) {
        try {
            const upload = !isAdmin && !existing
                ? await uploadWorkRequestCover(selectedCoverFile)
                : await uploadImage(selectedCoverFile);
            ({ url: cover, fileId: coverFileId } = upload);
        } catch (error) {
            console.error("Não foi possível enviar a imagem da capa:", error);
            showFeedback(error.message || "Não foi possível enviar a imagem da capa.", true);
            return;
        }
    }
    const updated = {
        title,
        author: String(formData.get("author") || "").trim(),
        gender: formData.getAll("gender").map((value) => String(value).trim()).filter(Boolean).join(", "),
        formato: String(formData.get("formato") || ""),
        description: String(formData.get("description") || "").trim(),
        cover,
        coverFileId
    };
    if (!updated.gender) {
        showFeedback("Selecione ao menos uma categoria para a obra.", true);
        return;
    }

    try {
        if (!isAdmin && !existing) {
            await apiRequest("/api/pedido_obra", {
                method: "POST",
                body: {
                    nomeObra: updated.title,
                    author: updated.author,
                    sinopse: updated.description,
                    coverUrl: updated.cover,
                    coverFileId: updated.coverFileId,
                    gender: updated.gender,
                    formato: updated.formato
                },
                authenticated: true
            });
            closeEditor();
            await loadWorkRequest();
            showFeedback("");
            selectedCoverFile = undefined;
            return;
        }
        const result = await apiRequest(
            existing ? `/api/works/${encodeURIComponent(workId)}` : "/api/works",
            { method: existing ? "PUT" : "POST", body: updated, authenticated: true }
        );
        invalidatePublicCatalogCache();
        works = existing
            ? works.map((work) => work.id === workId
                ? { ...result.work, id: workId, chapters: work.chapters }
                : work)
            : [result.work, ...works];
        renderWorks();
        closeEditor();
        showFeedback(existing ? "Obra atualizada no Neon PostgreSQL." : "Obra adicionada no Neon PostgreSQL.");
        selectedCoverFile = undefined;
    } catch (error) {
        console.error("Não foi possível salvar a obra:", error);
        showFeedback(error.message || "Não foi possível salvar a obra.", true);
    }
}

async function handleChapterSubmit(form) {
    if (pendingChapterSubmissions.has(form)) return;
    const formData = new FormData(form);
    const work = works.find((item) => item.id === form.dataset.workId);
    if (!work) {
        showFeedback("A obra selecionada não foi encontrada.", true);
        return;
    }
    const chapterId = form.dataset.chapterId;
    const existing = work.chapters.find((item) => item.id === chapterId);
    const number = Number(formData.get("number"));
    const title = String(formData.get("title") || "").trim();
    if (!Number.isInteger(number) || number < 1) {
        showFeedback("Informe um número de capítulo inteiro maior que zero.", true);
        return;
    }
    let pages = [...selectedChapterExistingPages];
    if (!selectedArchive && selectedChapterImages.length === 0 && pages.length === 0) {
        showFeedback("Adicione ao menos uma imagem ou um arquivo ZIP com as páginas do capítulo.", true);
        return;
    }

    const submitButton = form.querySelector(".submit-button");
    const formButtons = [...form.querySelectorAll("button")];
    const originalButtonLabel = submitButton?.textContent || "";
    pendingChapterSubmissions.add(form);
    form.setAttribute("aria-busy", "true");
    formButtons.forEach((button) => {
        button.disabled = true;
    });

    try {
        if (selectedArchive) {
            if (!selectedArchivePages) {
                if (submitButton) submitButton.textContent = "Enviando páginas…";
                showOperationProgress("Enviando e processando as páginas do ZIP. Aguarde; isso pode levar alguns minutos conforme o tamanho do arquivo.");
                ({ pages: selectedArchivePages } = await uploadChapterArchive(selectedArchive));
            }
            pages.push(...selectedArchivePages);
        }
        for (const [index, image] of selectedChapterImages.entries()) {
            if (!image.uploadedPage) {
                if (submitButton) submitButton.textContent = `Enviando imagem ${index + 1}/${selectedChapterImages.length}…`;
                showOperationProgress(`Enviando imagem ${index + 1} de ${selectedChapterImages.length}. Aguarde.`);
                image.uploadedPage = await uploadImage(image.file);
            }
            pages.push(image.uploadedPage);
        }
        if (pages.length === 0) {
            showFeedback("Adicione ao menos uma imagem ao capítulo.", true);
            return;
        }

        if (submitButton) submitButton.textContent = "Salvando capítulo…";
        if (selectedArchive || selectedChapterImages.length) {
            showOperationProgress("Páginas enviadas. Salvando o capítulo, aguarde.");
        }
        const result = await apiRequest(
            existing
                ? `/api/chapters/${encodeURIComponent(chapterId)}`
                : `/api/works/${encodeURIComponent(work.id)}/chapters`,
            {
                method: existing ? "PUT" : "POST",
                body: {
                    number,
                    title,
                    language: String(formData.get("language") || "pt-BR"),
                    pages
                },
                authenticated: true
            }
        );
        invalidatePublicCatalogCache();
        work.chapters = existing
            ? work.chapters.map((chapter) => chapter.id === chapterId
                ? { ...result.chapter, authorName: currentUserName }
                : chapter)
            : [...work.chapters, { ...result.chapter, authorName: currentUserName }]
                .sort((left, right) => left.number - right.number);
        renderWorks();
        closeEditor();
        showFeedback(
            result.cleanupWarning || (existing ? "Capítulo atualizado no Neon PostgreSQL." : "Capítulo adicionado no Neon PostgreSQL."),
            Boolean(result.cleanupWarning)
        );
    } catch (error) {
        console.error("Não foi possível enviar ou salvar o capítulo:", error);
        showFeedback(error.message || "Não foi possível enviar ou salvar o capítulo.", true);
    } finally {
        closeOperationProgress();
        pendingChapterSubmissions.delete(form);
        form.removeAttribute("aria-busy");
        formButtons.forEach((button) => {
            button.disabled = false;
        });
        if (submitButton?.isConnected) submitButton.textContent = originalButtonLabel;
    }
}

async function handleAction(action, card, chapterRow, actionButton) {
    const workId = card?.dataset.workId;
    const chapterId = chapterRow?.dataset.chapterId;
    const work = works.find((item) => item.id === workId);

    switch (action) {
        case "add-work":
            setEditor("work", null);
            editorRegion.scrollIntoView({ behavior: "smooth", block: "start" });
            break;
        case "edit-work":
            setEditor("work", workId);
            workList.querySelector(`.work-editor-region[data-work-id="${CSS.escape(workId)}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            break;
        case "add-chapter":
            setEditor("chapter", workId);
            workList.querySelector(`.chapter-editor-region[data-work-id="${CSS.escape(workId)}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            break;
        case "edit-chapter":
            setEditor("chapter", workId, chapterId);
            workList.querySelector(`.chapter-editor-region[data-work-id="${CSS.escape(workId)}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            break;
        case "toggle-chapters": {
            const isExpanded = actionButton.getAttribute("aria-expanded") === "true";
            const expanded = !isExpanded;
            card.querySelectorAll(".chapter-row[data-extra-chapter]").forEach((row) => {
                row.hidden = !expanded;
            });
            actionButton.setAttribute("aria-expanded", String(expanded));
            actionButton.title = expanded
                ? `Recolher capítulos de ${work.title}`
                : `Mostrar todos os ${work.chapters.length} capítulos de ${work.title}`;
            actionButton.setAttribute("aria-label", actionButton.title);
            break;
        }
        case "delete-work":
            if (work && await confirmInPage({
                title: "Excluir obra?",
                message: `Excluir “${work.title}”, todos os capítulos e todas as imagens (capa e páginas) do ImageKit? Esta ação não pode ser desfeita.`,
                confirmLabel: "Excluir obra",
                destructive: true
            })) {
                actionButton.disabled = true;
                showOperationProgress(`Apagando “${work.title}”, seus capítulos e imagens. Aguarde; esta operação pode levar alguns minutos.`);
                try {
                    await apiRequest(`/api/works/${encodeURIComponent(workId)}`, {
                        method: "DELETE",
                        authenticated: true
                    });
                    invalidatePublicCatalogCache();
                    works = works.filter((item) => item.id !== workId);
                    catalogWorks = catalogWorks.filter((item) => item.id !== workId);
                    renderWorks();
                    closeEditor();
                    showFeedback("Obra, capítulos e imagens excluídos do Neon PostgreSQL e do ImageKit.");
                } catch (error) {
                    console.error("Não foi possível excluir a obra:", error);
                    showFeedback(getDeleteErrorMessage(error, "obra"), true);
                } finally {
                    closeOperationProgress();
                    if (actionButton.isConnected) actionButton.disabled = false;
                }
            }
            break;
        case "delete-chapter":
            if (work && await confirmInPage({
                title: "Excluir capítulo?",
                message: `Excluir “${chapterRow.querySelector(".chapter-row-title").textContent}” e suas imagens do ImageKit? Esta ação não pode ser desfeita.`,
                confirmLabel: "Excluir capítulo",
                destructive: true
            })) {
                actionButton.disabled = true;
                const chapterTitle = chapterRow.querySelector(".chapter-row-title").textContent;
                showOperationProgress(`Apagando “${chapterTitle}” e suas imagens. Aguarde.`);
                try {
                    await apiRequest(`/api/chapters/${encodeURIComponent(chapterId)}`, {
                        method: "DELETE",
                        authenticated: true
                    });
                    invalidatePublicCatalogCache();
                    work.chapters = work.chapters.filter((chapter) => chapter.id !== chapterId);
                    renderWorks();
                    showFeedback("Capítulo e imagens excluídos do Neon PostgreSQL e do ImageKit.");
                } catch (error) {
                    console.error("Não foi possível excluir o capítulo:", error);
                    showFeedback(error.message || "Não foi possível excluir o capítulo.", true);
                } finally {
                    closeOperationProgress();
                    if (actionButton.isConnected) actionButton.disabled = false;
                }
            }
            break;
        case "close-editor":
            closeEditor();
            showFeedback("");
            break;
        case "submit-form": {
            const form = managementPage.querySelector(".editor-region form");
            if (form && !form.reportValidity()) return;
            if (form?.dataset.formType === "work") void handleWorkSubmit(form);
            if (form?.dataset.formType === "chapter") {
                void handleChapterSubmit(form);
            }
            break;
        }
        default:
            break;
    }
}

addWorkButton.addEventListener("click", () => handleAction("add-work"));
managementPage.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    void handleAction(
        button.dataset.action,
        button.closest(".work-card"),
        button.closest(".chapter-row"),
        button
    );
});

managementPage.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.dataset.formType === "work") void handleWorkSubmit(event.target);
    if (event.target.dataset.formType === "chapter") void handleChapterSubmit(event.target);
});

workList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-request-action='delete']");
    if (!button) return;
    const card = button.closest(".work-request-card");
    const request = workRequests.find((item) => item.id === card?.dataset.requestId);
    if (!request) return;
    const isRejected = request.status?.toUpperCase() === "REPROVADO";
    const confirmed = await confirmInPage({
        title: isRejected ? "Excluir pedido negado?" : "Cancelar análise?",
        message: isRejected
            ? `Excluir o registro do pedido negado “${request.title}”? Esta ação não pode ser desfeita.`
            : `Cancelar a análise do pedido “${request.title}”? A capa e as informações enviadas serão apagadas.`,
        confirmLabel: isRejected ? "Excluir pedido" : "Cancelar análise",
        destructive: true
    });
    if (!confirmed) return;

    button.disabled = true;
    try {
        await apiRequest(`/api/pedido_obra/${encodeURIComponent(request.id)}`, {
            method: "DELETE",
            authenticated: true
        });
        workRequests = workRequests.filter((item) => item.id !== request.id);
        renderWorks();
        if (!workRequests.some((item) => item.status?.toUpperCase() === "PENDENTE")) {
            stopWorkRequestPolling();
        }
        showFeedback(isRejected ? "Pedido negado excluído." : "Análise cancelada. A capa e as informações do pedido foram excluídas.");
    } catch (error) {
        console.error("Não foi possível excluir ou cancelar o pedido de obra:", error);
        showFeedback(getDeleteErrorMessage(error, "pedido de obra"), true);
        button.disabled = false;
    }
});

async function initializeManagementPage() {
    try {
        const user = await account.get();
        currentUserId = user.$id;
        currentUserName = user.name || "Moderador";
        isAdmin = user.email?.trim().toLowerCase() === adminEmail || user.labels?.includes("admin");
        const isModerator = isAdmin || user.labels?.includes("moderator");
        document.body.hidden = false;
        document.body.style.display = "";
        if (!isModerator) {
            pageTitle.textContent = "Solicitar moderação";
            document.title = "Solicitar moderação | HokuPédia";
            addWorkButton.hidden = true;
            workManagementRegion.hidden = true;
            moderationRequestRegion.hidden = false;
            try {
                await loadModerationRequest();
            } catch (error) {
                if (error.code === 401) {
                    window.location.replace("/HTML/CadLog.html?mode=login");
                    return;
                }
                console.error("Não foi possível carregar o pedido de moderação:", error);
                showRequestFeedback(error.message || "Não foi possível carregar os dados do pedido.", true);
            }
            return;
        }

        workManagementRegion.hidden = false;
        moderationRequestRegion.hidden = true;
        addWorkButton.innerHTML = isAdmin
            ? '<span aria-hidden="true">＋</span> Adicionar Obra'
            : '<span aria-hidden="true">＋</span> Solicitar Obra';
        await loadWorks();
        if (!isAdmin) await loadWorkRequest();
    } catch (error) {
        if (error.code === 401) {
            window.location.replace("/HTML/CadLog.html?mode=login");
            return;
        }
        document.body.hidden = false;
        document.body.style.display = "";
        console.error("Não foi possível inicializar o gerenciamento de obras:", error);
        workManagementRegion.hidden = false;
        showFeedback(error.message || "Não foi possível carregar as obras.", true);
    }
}

function showRequestFeedback(message, isError = false) {
    requestFeedback.textContent = message;
    requestFeedback.classList.toggle("is-error", isError);
}

function showRequestStatus(title, description, canRetry = false) {
    requestStatusTitle.textContent = title;
    requestStatusDescription.textContent = description;
    retryModerationButton.hidden = !canRetry;
    requestStatus.hidden = false;
    moderationForm.hidden = true;
}

async function loadModerationRequest() {
    const data = await apiRequest("/api/pedido_moderacao/me", { authenticated: true });
    if (data.isModerator) {
        showRequestStatus(
            "Sua conta já tem acesso de moderação.",
            "Atualize a página para abrir o gerenciamento de obras."
        );
        return;
    }
    const status = data.request?.status?.toUpperCase();
    if (status === "PENDENTE") {
        showRequestStatus(
            "Pedido em análise.",
            "O administrador analisará sua solicitação. Você não precisa enviar outro pedido."
        );
    } else if (status === "REPROVADO") {
        showRequestStatus(
            "Seu pedido para ser moderador foi negado.",
            "Você pode revisar as informações e enviar uma nova solicitação.",
            true
        );
    }
}

retryModerationButton.addEventListener("click", () => {
    requestStatus.hidden = true;
    moderationForm.hidden = false;
    moderationForm.querySelector("#preferredLanguages").focus();
});

moderationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!moderationForm.reportValidity()) return;

    const submitButton = moderationForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showRequestFeedback("Enviando seu pedido...");
    try {
        await apiRequest("/api/pedido_moderacao", {
            method: "POST",
            body: {
                motivos: moderationForm.elements.motivos.value.trim(),
                idiomas_preferencia: moderationForm.elements.idiomas_preferencia.value
            },
            authenticated: true
        });
        moderationForm.reset();
        showRequestStatus(
            "Pedido enviado para análise.",
            "O administrador analisará sua solicitação. Você receberá o acesso de moderador após a aprovação."
        );
        showRequestFeedback("");
    } catch (error) {
        console.error("Não foi possível enviar o pedido de moderação:", error);
        showRequestFeedback(error.message || "Não foi possível enviar seu pedido.", true);
    } finally {
        submitButton.disabled = false;
    }
});

void initializeManagementPage();
