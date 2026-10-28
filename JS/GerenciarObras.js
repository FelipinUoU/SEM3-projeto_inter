import { createAuthorIcon } from "./authorIcon.js";

const storageKey = "hokupedia.works.v1";
const imageTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const languageNames = {
    "pt-BR": "Português (Brasil)",
    ja: "Japonês",
    en: "Inglês",
    es: "Espanhol"
};
const workList = document.querySelector("#workList");
const editorRegion = document.querySelector("#editorRegion");
const managementPage = document.querySelector(".management-page");
const addWorkButton = document.querySelector("#addWorkButton");
const feedback = document.querySelector("#feedback");
let works = loadWorks();
let selectedFiles = [];
let previewObjectUrls = [];
let selectedCoverFile;
let coverPreviewUrl;

async function apiRequest(url, options = {}) {
    const { authenticated = false, ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers);
    if (requestOptions.body && !(requestOptions.body instanceof Blob)) {
        headers.set("Content-Type", "application/json");
        requestOptions.body = JSON.stringify(requestOptions.body);
    }
    if (authenticated) {
        const { jwt } = await account.createJWT();
        headers.set("X-Appwrite-JWT", jwt);
    }

    const response = await fetch(url, { ...requestOptions, headers });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) throw new Error(data.error || `A solicitação falhou (HTTP ${response.status}).`);
    if (!contentType.includes("application/json")) {
        throw new Error(`Resposta inesperada do servidor (HTTP ${response.status}).`);
    }
    return data;
}

async function uploadImage(file) {
    return apiRequest(`/api/uploads?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        authenticated: true
    });
}

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

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
    return `Cap ${getChapterNumber(chapter, index)}${title ? ` — ${title}` : ""}`;
}

function renderWorkCard(work) {
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
    description.textContent = work.description || "Sem descrição.";
    details.append(description);

    const actions = document.createElement("div");
    actions.className = "work-actions";
    const hubLink = document.createElement("a");
    hubLink.className = "text-action hub-action";
    hubLink.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
    hubLink.textContent = "Ver Hub";
    actions.append(hubLink);
    actions.append(
        createButton("✎ Editar", "edit-work", "text-action edit-action"),
        createButton("⊕ Novo Capítulo", "add-chapter", "text-action chapter-action")
    );
    details.append(actions);
    card.append(details);

    card.append(createButton("×", "delete-work", "icon-action delete-action", `Excluir obra ${work.title}`));

    const chapterList = document.createElement("div");
    chapterList.className = "work-chapters";
    if (work.chapters.length === 0) {
        const empty = document.createElement("p");
        empty.className = "no-chapters";
        empty.textContent = "Sem Capítulos";
        chapterList.append(empty);
    } else {
        for (const [index, chapter] of work.chapters.entries()) {
            const row = document.createElement("div");
            row.className = "chapter-row";

            const flag = document.createElement("span");
            flag.textContent = chapter.language === "pt-BR" ? "🇧🇷"
                : chapter.language === "ja" ? "🇯🇵"
                    : chapter.language === "es" ? "🇪🇸" : "🇺🇸";
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
            authorName.textContent = "MeridinhaFDP";
            chapterAuthor.append(authorName);
            row.append(chapterAuthor);

            row.append(
                createButton("Editar", "edit-chapter", "chapter-row-action", `Editar ${getChapterDisplayName(chapter, index)}`),
                createButton("Excluir", "delete-chapter", "chapter-row-action", `Excluir ${getChapterDisplayName(chapter, index)}`)
            );
            row.dataset.chapterId = chapter.id;
            chapterList.append(row);
        }
    }
    card.append(chapterList);
    const chapterEditorRegion = document.createElement("section");
    chapterEditorRegion.className = "editor-region chapter-editor-region";
    chapterEditorRegion.dataset.workId = work.id;
    chapterEditorRegion.setAttribute("aria-live", "polite");
    card.append(chapterEditorRegion);
    const workEditorRegion = document.createElement("section");
    workEditorRegion.className = "editor-region work-editor-region";
    workEditorRegion.dataset.workId = work.id;
    workEditorRegion.setAttribute("aria-live", "polite");
    card.append(workEditorRegion);
    return card;
}

function renderWorks() {
    workList.replaceChildren();
    if (works.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-works";
        empty.textContent = "Nenhuma obra cadastrada. Use “Adicionar Obra” para começar.";
        workList.append(empty);
        return;
    }
    for (const work of works) workList.append(renderWorkCard(work));
}

function createField({ id, label, name, value = "", type = "text", placeholder = "", required = false }) {
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

function renderWorkForm(work, targetRegion = editorRegion) {
    const isEditing = Boolean(work);
    const panel = createEditorPanel(isEditing ? "Editar Obra" : "Adicionar Obra");
    const form = document.createElement("form");
    form.className = "editor-form";
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
    fields.append(
        createField({
            id: "workName",
            label: "Nome",
            name: "title",
            value: work?.title || "",
            placeholder: "Ex.: Naruto",
            required: true
        }),
        createField({
            id: "workAuthor",
            label: "Autor",
            name: "author",
            value: work?.author || "",
            placeholder: "Nome do autor"
        }),
        createField({
            id: "workDescription",
            label: "Descrição",
            name: "description",
            value: work?.description || "",
            type: "textarea",
            placeholder: "Apresente a obra"
        })
    );
    layout.append(coverLabel, coverInput, fields);
    form.append(layout);
    form.append(createFormActions());

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
    row.className = "form-row";
    row.append(createLanguageSelect(chapter?.language || "pt-BR"));
    const formatField = document.createElement("div");
    formatField.className = "field";
    formatField.append(document.createTextNode("Formato do arquivo"));
    const formatText = document.createElement("div");
    formatText.className = "selected-files";
    formatText.textContent = "Envie um arquivo .zip com as imagens PNG, JPG, JPEG, WEBP, GIF ou AVIF.";
    formatField.append(formatText);
    row.append(formatField);
    form.append(row);

    const uploadLabel = document.createElement("label");
    uploadLabel.className = "upload-label";
    uploadLabel.htmlFor = "chapterPages";
    const uploadIcon = document.createElement("span");
    uploadIcon.className = "upload-icon";
    uploadIcon.setAttribute("aria-hidden", "true");
    uploadIcon.textContent = "↑";
    uploadLabel.append(uploadIcon);
    const uploadStrong = document.createElement("strong");
    uploadStrong.textContent = "Clique para selecionar um arquivo .zip";
    uploadLabel.append(uploadStrong);
    const uploadHint = document.createElement("span");
    uploadHint.textContent = "O ZIP deve conter apenas imagens e não pode ter senha.";
    uploadLabel.append(uploadHint);

    const fileInput = document.createElement("input");
    fileInput.className = "file-input";
    fileInput.id = "chapterPages";
    fileInput.name = "archive";
    fileInput.type = "file";
    fileInput.accept = ".zip,application/zip,application/x-zip-compressed";
    form.append(uploadLabel, fileInput);

    const selectedFilesLabel = document.createElement("p");
    selectedFilesLabel.className = "selected-files";
    selectedFilesLabel.id = "selectedFiles";
    const existingNames = chapter?.pages?.map((page) => (
        typeof page === "string" ? page : page.name
    )) || [];
    selectedFilesLabel.textContent = existingNames.length
        ? `Arquivos registrados: ${existingNames.map((name) => name || "Página").join(", ")}`
        : "Nenhum arquivo selecionado.";
    form.append(selectedFilesLabel, createFormActions());

    fileInput.addEventListener("change", () => {
        const [file] = fileInput.files;
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".zip")) {
            fileInput.value = "";
            selectedArchive = undefined;
            selectedFilesLabel.textContent = existingNames.length
                ? `Arquivos registrados: ${existingNames.join(", ")}`
                : "Nenhum arquivo selecionado.";
            showFeedback("Selecione somente um arquivo com extensão .zip.", true);
            return;
        }
        selectedArchive = file;
        selectedFilesLabel.textContent = `ZIP selecionado: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        showFeedback("");
    });

    uploadLabel.addEventListener("dragover", (event) => {
        event.preventDefault();
        uploadLabel.classList.add("is-dragging");
    });
    uploadLabel.addEventListener("dragleave", () => uploadLabel.classList.remove("is-dragging"));
    uploadLabel.addEventListener("drop", (event) => {
        event.preventDefault();
        uploadLabel.classList.remove("is-dragging");
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length > 1) {
            selectedArchive = undefined;
            fileInput.value = "";
            selectedFilesLabel.textContent = "Selecione somente um arquivo .zip.";
            showFeedback("Arraste somente um arquivo .zip por capítulo.", true);
            return;
        }
        const [file] = files;
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".zip")) {
            selectedArchive = undefined;
            fileInput.value = "";
            selectedFilesLabel.textContent = existingNames.length
                ? `Arquivos registrados: ${existingNames.join(", ")}`
                : "Nenhum arquivo selecionado.";
            showFeedback("Arraste somente um arquivo com extensão .zip.", true);
            return;
        }
        selectedArchive = file;
        selectedFilesLabel.textContent = `ZIP selecionado: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        showFeedback("");
    });

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

function createFormActions() {
    const actions = document.createElement("div");
    actions.className = "form-actions";
    actions.append(
        createButton("Cancelar", "close-editor", "cancel-button"),
        createButton("Salvar", "submit-form", "submit-button")
    );
    return actions;
}

function closeEditor() {
    selectedArchive = undefined;
    selectedCoverFile = undefined;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = undefined;
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
    const workId = form.dataset.workId;
    const existing = works.find((work) => work.id === workId);
    let cover = existing?.cover || "";
    let coverFileId = existing?.coverFileId || "";
    if (selectedCoverFile) {
        try {
            ({ url: cover, fileId: coverFileId } = await uploadImage(selectedCoverFile));
        } catch (error) {
            console.error("Não foi possível enviar a imagem da capa:", error);
            showFeedback(error.message || "Não foi possível enviar a imagem da capa.", true);
            return;
        }
    }
    const updated = {
        title,
        author: String(formData.get("author") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        cover,
        coverFileId
    };

    try {
        const result = await apiRequest(
            existing ? `/api/works/${encodeURIComponent(workId)}` : "/api/works",
            { method: existing ? "PUT" : "POST", body: updated, authenticated: true }
        );
        works = existing
            ? works.map((work) => work.id === workId
                ? { ...result.work, id: workId, chapters: work.chapters }
                : work)
            : [result.work, ...works];
        renderWorks();
        closeEditor();
        showFeedback(existing ? "Obra atualizada no Appwrite." : "Obra adicionada ao Appwrite.");
        selectedCoverFile = undefined;
    } catch (error) {
        console.error("Não foi possível salvar a obra:", error);
        showFeedback(error.message || "Não foi possível salvar a obra.", true);
    }
}

async function handleChapterSubmit(form) {
    const formData = new FormData(form);
    const work = works.find((item) => item.id === form.dataset.workId);
    if (!work) {
        showFeedback("A obra selecionada não foi encontrada.", true);
        return;
    }
    const chapterId = form.dataset.chapterId;
    const existing = work.chapters.find((item) => item.id === chapterId);
    const number = Number(formData.get("number"));
    let pages = existing?.pages || [];
    if (!selectedFiles.length && pages.some((page) => !page || typeof page !== "object" || !page.dataUrl)) {
        showFeedback("Este capítulo foi salvo numa versão antiga. Selecione novamente as imagens antes de salvar.", true);
        return;
    }
    if (selectedFiles.length) {
        try {
            pages = await Promise.all(selectedFiles.map(async (file) => ({
                name: file.name,
                dataUrl: await fileToDataUrl(file)
            })));
        } catch (error) {
            console.error("Não foi possível ler as imagens do capítulo:", error);
            showFeedback("Não foi possível ler uma ou mais imagens. Tente selecioná-las novamente.", true);
            return;
        }
    }
    const title = String(formData.get("title") || "").trim();
    if (!Number.isInteger(number) || number < 1) {
        showFeedback("Informe um número de capítulo inteiro maior que zero.", true);
        return;
    }

    const chapter = {
        id: existing?.id || createId(),
        number,
        title,
        language: String(formData.get("language") || "pt-BR"),
        pages
    };
    work.chapters = existing
        ? work.chapters.map((item) => item.id === chapterId ? chapter : item)
        : [...work.chapters, chapter];

    if (!saveWorks()) return;
    renderWorks();
    closeEditor();
    selectedFiles = [];
    showFeedback(existing
        ? "Capítulo atualizado e páginas salvas neste navegador."
        : "Capítulo adicionado e páginas salvas neste navegador.");
}

function handleAction(action, card, chapterRow) {
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
        case "delete-work":
            if (work && window.confirm(`Excluir a obra “${work.title}” e todos os seus capítulos?`)) {
                try {
                    await apiRequest(`/api/works/${encodeURIComponent(workId)}`, {
                        method: "DELETE",
                        authenticated: true
                    });
                    works = works.filter((item) => item.id !== workId);
                    renderWorks();
                    closeEditor();
                    showFeedback("Obra excluída do Appwrite.");
                } catch (error) {
                    console.error("Não foi possível excluir a obra:", error);
                    showFeedback(error.message || "Não foi possível excluir a obra.", true);
                }
            }
            break;
        case "delete-chapter":
            if (work && window.confirm(`Excluir “${chapterRow.querySelector(".chapter-row-title").textContent}”?`)) {
                try {
                    await apiRequest(`/api/chapters/${encodeURIComponent(chapterId)}`, {
                        method: "DELETE",
                        authenticated: true
                    });
                    work.chapters = work.chapters.filter((chapter) => chapter.id !== chapterId);
                    renderWorks();
                    showFeedback("Capítulo excluído do Appwrite.");
                } catch (error) {
                    console.error("Não foi possível excluir o capítulo:", error);
                    showFeedback(error.message || "Não foi possível excluir o capítulo.", true);
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
    const previewButton = event.target.closest(".page-preview-open");
    if (previewButton) {
        const dialog = getImagePreviewDialog();
        dialog.querySelector("img").src = previewButton.dataset.previewSrc;
        dialog.querySelector("img").alt = previewButton.dataset.previewAlt;
        dialog.showModal();
        return;
    }

    const button = event.target.closest("button[data-action]");
    if (!button) return;
    void handleAction(
        button.dataset.action,
        button.closest(".work-card"),
        button.closest(".chapter-row")
    );
});

if (isAdmin) managementPage.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.dataset.formType === "work") void handleWorkSubmit(event.target);
    if (event.target.dataset.formType === "chapter") void handleChapterSubmit(event.target);
});

renderWorks();
