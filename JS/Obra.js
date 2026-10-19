const storageKey = "hokupedia.works.v1";
const readHistoryKey = "hokupedia.readChapters.v1";
const seedWork = {
    id: "demo-naruto",
    title: "Naruto",
    author: "Masashi Kishimoto",
    description: "Acompanhe os capítulos desta obra.",
    chapters: []
};
const chapterList = document.querySelector("#chapterList");
const workTitle = document.querySelector("#workTitle");
const workDescription = document.querySelector("#workDescription");
const workAuthor = document.querySelector("#workAuthor");
const workCover = document.querySelector("#workCover");

function createAuthorIcon() {
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

    return icon;
}

function loadOpenedChapters() {
    try {
        const stored = localStorage.getItem(readHistoryKey);
        if (stored === null) return new Set();
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || parsed.some((key) => typeof key !== "string")) {
            throw new Error("O histórico local de leitura está inválido.");
        }
        return new Set(parsed);
    } catch (error) {
        console.error("Não foi possível carregar o histórico de leitura:", error);
        return new Set();
    }
}

function loadWork() {
    try {
        const storedWorks = localStorage.getItem(storageKey);
        if (storedWorks === null) return seedWork;

        const works = JSON.parse(storedWorks);
        if (!Array.isArray(works)) throw new Error("A lista local de obras é inválida.");

        const requestedId = new URLSearchParams(window.location.search).get("obra");
        const selectedWork = requestedId
            ? works.find((work) => work.id === requestedId)
            : works[0];
        if (!selectedWork) return null;
        if (typeof selectedWork.title !== "string" || !Array.isArray(selectedWork.chapters)) {
            throw new Error("Os dados da obra selecionada são inválidos.");
        }
        return selectedWork;
    } catch (error) {
        console.error("Não foi possível carregar os dados da obra:", error);
        return seedWork;
    }
}

function renderChapters() {
    chapterList.replaceChildren();
    const work = loadWork();

    if (!work) {
        workTitle.textContent = "Obra não encontrada";
        workDescription.textContent = "Selecione uma obra cadastrada para continuar.";
        workAuthor.textContent = "HokuPédia";
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Nenhuma obra cadastrada. Adicione uma obra pelo gerenciamento.";
        chapterList.append(emptyState);
        return;
    }

    workTitle.textContent = work.title;
    workDescription.textContent = work.description || "Sem descrição.";
    workAuthor.textContent = work.author || "Autor não informado";
    if (work.cover) {
        const coverImage = document.createElement("img");
        coverImage.src = work.cover;
        coverImage.alt = `Capa de ${work.title}`;
        workCover.replaceChildren(coverImage);
        workCover.removeAttribute("aria-hidden");
    }
    document.title = `${work.title} — Hub de Obra | HokuPédia`;

    if (work.chapters.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Esta obra ainda não possui capítulos.";
        chapterList.append(emptyState);
        return;
    }

    const openedChapters = loadOpenedChapters();
    for (const [index, chapter] of work.chapters.entries()) {
        const chapterId = chapter.id || `${work.id}-chapter-${index + 1}`;
        const chapterNumber = Number.isInteger(chapter.number) && chapter.number > 0
            ? chapter.number
            : index + 1;
        const chapterTitle = typeof chapter.title === "string" ? chapter.title.trim() : "";
        const displayName = `Cap ${chapterNumber}${chapterTitle ? ` — ${chapterTitle}` : ""}`;
        const link = document.createElement("a");
        link.className = "chapter-card";
        link.href = `/HTML/Leitura.html?obra=${encodeURIComponent(work.id)}&capitulo=${encodeURIComponent(chapterId)}`;
        link.setAttribute("aria-label", `Abrir ${displayName}`);
        const hasBeenOpened = openedChapters.has(`${work.id}:${chapterId}`);
        if (hasBeenOpened) link.classList.add("chapter-card--opened");

        const flag = document.createElement("span");
        flag.className = "chapter-flag";
        const chapterLanguage = chapter.language || "pt-BR";
        const flagValue = chapterLanguage === "pt-BR" ? "🇧🇷"
            : chapterLanguage === "ja" ? "🇯🇵"
                : chapterLanguage === "es" ? "🇪🇸" : "🇺🇸";
        flag.setAttribute("aria-label", chapterLanguage);
        flag.textContent = flagValue;
        link.append(flag);

        const divider = document.createElement("span");
        divider.className = "chapter-divider";
        divider.setAttribute("aria-hidden", "true");
        link.append(divider);

        const title = document.createElement("span");
        title.className = "chapter-title";
        title.textContent = displayName;
        link.append(title);

        if (hasBeenOpened) {
            const readBadge = document.createElement("span");
            readBadge.className = "chapter-read-badge";
            readBadge.textContent = "Já aberto";
            readBadge.setAttribute("aria-label", "Você já abriu este capítulo");
            link.append(readBadge);
        }

        const author = document.createElement("span");
        author.className = "chapter-author";
        author.append(createAuthorIcon());

        const authorName = document.createElement("span");
        authorName.textContent = "MeridinhaFDP";
        author.append(authorName);
        link.append(author);

        const arrow = document.createElement("span");
        arrow.className = "chapter-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        link.append(arrow);

        chapterList.append(link);
    }
}

renderChapters();
