const storageKey = "hokupedia.works.v1";
const imageTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const languageNames = {
    "pt-BR": "Português (Brasil)",
    ja: "Japonês",
    en: "Inglês",
    es: "Espanhol"
};
const seedWorks = [{
    id: "demo-naruto",
    title: "Naruto",
    author: "Masashi Kishimoto",
    description: "Acompanhe os capítulos desta obra.",
    chapters: []
}];

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

function createId() {
    return globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadWorks() {
    try {
        const stored = localStorage.getItem(storageKey);
        if (stored === null) {
            const initialWorks = structuredClone(seedWorks);
            localStorage.setItem(storageKey, JSON.stringify(initialWorks));
            return initialWorks;
        }

        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)
            || parsed.some((work) => !work || typeof work.id !== "string"
                || typeof work.title !== "string" || !Array.isArray(work.chapters))) {
            throw new Error("Os dados de obras salvos neste navegador estão inválidos.");
        }
        return parsed;
    } catch (error) {
        console.error("Não foi possível carregar as obras salvas:", error);
        showFeedback("Não foi possível carregar os dados locais. Verifique o armazenamento do navegador.", true);
        return structuredClone(seedWorks);
    }
}

function saveWorks() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(works));
        return true;
    } catch (error) {
        console.error("Não foi possível salvar as obras neste navegador:", error);
        showFeedback("Não foi possível salvar. O armazenamento do navegador pode estar indisponível.", true);
        return false;
    }
}

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

function appendAuthorIcon(parent) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("class", "author-icon");
    icon.setAttribute("aria-hidden", "true");

    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("cx", "12");
    head.setAttribute("cy", "7");
    head.setAttribute("r", "4");
    icon.append(head);

    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.setAttribute("d", "M4.5 21v-2a7.5 7.5 0 0 1 15 0v2");
    icon.append(body);
    parent.append(icon);
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
            appendAuthorIcon(chapterAuthor);
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
    formatField.append(document.createTextNode("Formatos aceitos"));
    const formatText = document.createElement("div");
    formatText.className = "selected-files";
    formatText.textContent = "Imagens: PNG, JPG, JPEG, WEBP, GIF ou AVIF";
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
    uploadStrong.textContent = "Clique para adicionar as páginas";
    uploadLabel.append(uploadStrong);
    const uploadHint = document.createElement("span");
    uploadHint.textContent = "Selecione uma ou mais imagens do capítulo";
    uploadLabel.append(uploadHint);

    const fileInput = document.createElement("input");
    fileInput.className = "file-input";
    fileInput.id = "chapterPages";
    fileInput.name = "pages";
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = [...imageTypes].join(",");
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
    const previewGrid = document.createElement("div");
    previewGrid.className = "page-preview-grid";
    previewGrid.id = "pagePreview";
    previewGrid.setAttribute("aria-label", "Pré-visualização das páginas selecionadas");
    form.append(selectedFilesLabel, previewGrid, createFormActions());

    fileInput.addEventListener("change", () => {
        acceptSelectedFiles([...fileInput.files], fileInput, selectedFilesLabel, previewGrid, existingNames);
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
        acceptSelectedFiles(files, fileInput, selectedFilesLabel, previewGrid, existingNames);
    });

    panel.append(form);
    targetRegion.replaceChildren(panel);
    renderPagePreviews(selectedFiles, previewGrid);
    document.querySelector("#chapterNumber").focus();
}

function revokePagePreviewUrls() {
    for (const url of previewObjectUrls) URL.revokeObjectURL(url);
    previewObjectUrls = [];
}

function acceptSelectedFiles(files, fileInput, selectedFilesLabel, previewGrid, existingNames) {
    const invalidFile = files.find((file) => !imageTypes.has(file.type));
    if (invalidFile) {
        selectedFiles = [];
        fileInput.value = "";
        revokePagePreviewUrls();
        previewGrid.replaceChildren();
        selectedFilesLabel.textContent = "Nenhum arquivo selecionado.";
        showFeedback(`O arquivo “${invalidFile.name}” não é uma imagem compatível.`, true);
        return;
    }

    selectedFiles = files;
    selectedFilesLabel.textContent = selectedFiles.length
        ? `${selectedFiles.length} página${selectedFiles.length === 1 ? "" : "s"} selecionada${selectedFiles.length === 1 ? "" : "s"}`
        : existingNames.length
            ? `Arquivos registrados: ${existingNames.join(", ")}`
            : "Nenhum arquivo selecionado.";
    renderPagePreviews(selectedFiles, previewGrid);
    showFeedback("");
}

function renderPagePreviews(files, previewGrid) {
    revokePagePreviewUrls();
    previewGrid.replaceChildren();

    files.forEach((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        previewObjectUrls.push(objectUrl);

        const item = document.createElement("figure");
        item.className = "page-preview";

        const imageButton = document.createElement("button");
        imageButton.className = "page-preview-open";
        imageButton.type = "button";
        imageButton.setAttribute("aria-label", `Ampliar pré-visualização da página ${index + 1}: ${file.name}`);
        imageButton.dataset.previewSrc = objectUrl;
        imageButton.dataset.previewAlt = `Pré-visualização ampliada da página ${index + 1}: ${file.name}`;
        const image = document.createElement("img");
        image.src = objectUrl;
        image.alt = "";
        image.loading = "lazy";
        imageButton.append(image);
        item.append(imageButton);

        const caption = document.createElement("figcaption");
        caption.textContent = `${String(index + 1).padStart(2, "0")} · ${file.name}`;
        caption.title = file.name;
        item.append(caption);
        previewGrid.append(item);
    });
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
    selectedFiles = [];
    revokePagePreviewUrls();
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

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("O navegador não retornou os dados da imagem."));
        }, { once: true });
        reader.addEventListener("error", () => reject(reader.error || new Error("Não foi possível ler a imagem.")), { once: true });
        reader.readAsDataURL(file);
    });
}

async function handleWorkSubmit(form) {
    const formData = new FormData(form);
    const workId = form.dataset.workId;
    const existing = works.find((work) => work.id === workId);
    let cover = existing?.cover || "";
    if (selectedCoverFile) {
        try {
            cover = await fileToDataUrl(selectedCoverFile);
        } catch (error) {
            console.error("Não foi possível carregar a imagem da capa:", error);
            showFeedback("Não foi possível ler a imagem da capa. Tente selecionar o arquivo novamente.", true);
            return;
        }
    }
    const updated = {
        id: existing?.id || createId(),
        title: String(formData.get("title") || "").trim(),
        author: String(formData.get("author") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        cover,
        chapters: existing?.chapters || []
    };
    if (!updated.title) {
        showFeedback("Informe o nome da obra.", true);
        return;
    }

    works = existing
        ? works.map((work) => work.id === workId ? updated : work)
        : [updated, ...works];
    if (!saveWorks()) return;
    renderWorks();
    closeEditor();
    showFeedback(existing ? "Obra atualizada." : "Obra adicionada.");
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
                works = works.filter((item) => item.id !== workId);
                if (!saveWorks()) return;
                renderWorks();
                closeEditor();
                showFeedback("Obra excluída deste navegador.");
            }
            break;
        case "delete-chapter":
            if (work && window.confirm(`Excluir “${chapterRow.querySelector(".chapter-row-title").textContent}”?`)) {
                work.chapters = work.chapters.filter((chapter) => chapter.id !== chapterId);
                if (!saveWorks()) return;
                renderWorks();
                showFeedback("Capítulo excluído deste navegador.");
            }
            break;
        case "close-editor":
            closeEditor();
            showFeedback("");
            break;
        case "submit-form": {
            const form = managementPage.querySelector(".editor-region form");
            if (form && !form.reportValidity()) return;
            if (form?.dataset.formType === "work") handleWorkSubmit(form);
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
    handleAction(
        button.dataset.action,
        button.closest(".work-card"),
        button.closest(".chapter-row")
    );
});

function getImagePreviewDialog() {
    let dialog = document.querySelector("#imagePreviewDialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.className = "image-preview-dialog";
    dialog.id = "imagePreviewDialog";
    const image = document.createElement("img");
    image.className = "image-preview-large";
    dialog.append(image);
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
        image.removeAttribute("src");
        image.alt = "";
    });
    document.body.append(dialog);
    return dialog;
}
managementPage.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.target.dataset.formType === "work") handleWorkSubmit(event.target);
    if (event.target.dataset.formType === "chapter") handleChapterSubmit(event.target);
});

renderWorks();
