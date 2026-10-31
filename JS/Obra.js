import { createAuthorIcon } from "./authorIcon.js";
import {
    getCurrentLibraryUser,
    loadAnonymousReadChapters,
    loadUserLibrary,
    toggleFavorite
} from "./userLibrary.js";

const chapterList = document.querySelector("#chapterList");
const workTitle = document.querySelector("#workTitle");
const workDescription = document.querySelector("#workDescription");
const workAuthor = document.querySelector("#workAuthor");
const workCover = document.querySelector("#workCover");
const manageLink = document.querySelector(".manage-link");
const favoriteButton = document.querySelector("#favoriteButton");
const favoriteFeedback = document.querySelector("#favoriteFeedback");
let currentWork;
let currentUser;

async function showAdminLink() {
    try {
        if (currentUser?.email.trim().toLowerCase() === "hokupedia@gmail.com") {
            manageLink.hidden = false;
        }
    } catch (error) {
        console.error("Não foi possível verificar o acesso administrativo:", error);
    }
}

function loadOpenedChapters() {
    try {
        const chapters = currentUser
            ? loadUserLibrary(currentUser.$id).readChapters
            : loadAnonymousReadChapters();
        return new Set(chapters);
    } catch (error) {
        console.error("Não foi possível carregar o histórico de leitura:", error);
        favoriteFeedback.textContent = "Não foi possível carregar os dados locais da biblioteca.";
        return new Set();
    }
}

function updateFavoriteButton(isFavorite) {
    favoriteButton.disabled = false;
    favoriteButton.textContent = isFavorite ? "★ Remover dos favoritos" : "☆ Adicionar aos favoritos";
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.classList.toggle("is-favorite", isFavorite);
}

favoriteButton.addEventListener("click", () => {
    if (!currentUser) {
        window.location.assign("/HTML/CadLog.html?mode=login");
        return;
    }
    if (!currentWork) return;

    try {
        const isFavorite = toggleFavorite(currentUser.$id, currentWork.id);
        updateFavoriteButton(isFavorite);
        favoriteFeedback.textContent = isFavorite
            ? "Obra adicionada aos favoritos."
            : "Obra removida dos favoritos.";
    } catch (error) {
        console.error("Não foi possível atualizar os favoritos:", error);
        favoriteFeedback.textContent = "Não foi possível salvar esta alteração. Tente novamente.";
    }
});

async function loadWork() {
    const response = await fetch("/api/works");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar as obras.");
    if (!Array.isArray(data.works)) throw new Error("A resposta do Appwrite contém uma lista de obras inválida.");

    const requestedId = new URLSearchParams(window.location.search).get("obra");
    return requestedId
        ? data.works.find((work) => work.id === requestedId) || null
        : data.works[0] || null;
}

async function renderChapters() {
    chapterList.replaceChildren();
    let work;
    try {
        [work, currentUser] = await Promise.all([loadWork(), getCurrentLibraryUser()]);
    } catch (error) {
        console.error("Não foi possível carregar os dados da obra:", error);
        workTitle.textContent = "Erro ao carregar obra";
        workDescription.textContent = error.message || "Não foi possível carregar os dados do Appwrite.";
        workAuthor.textContent = "HokuPédia";
        favoriteButton.disabled = true;
        return;
    }

    if (!work) {
        workTitle.textContent = "Obra não encontrada";
        workDescription.textContent = "Selecione uma obra cadastrada para continuar.";
        workAuthor.textContent = "HokuPédia";
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Nenhuma obra cadastrada. Adicione uma obra pelo gerenciamento.";
        chapterList.append(emptyState);
        favoriteButton.disabled = true;
        return;
    }

    currentWork = work;
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
    if (!currentUser) {
        favoriteButton.textContent = "Entrar para favoritar";
        favoriteButton.disabled = false;
        favoriteButton.setAttribute("aria-pressed", "false");
    } else {
        try {
            updateFavoriteButton(loadUserLibrary(currentUser.$id).favorites.includes(work.id));
        } catch (error) {
            console.error("Não foi possível carregar os favoritos:", error);
            favoriteButton.disabled = true;
            favoriteFeedback.textContent = "Não foi possível carregar os favoritos desta conta.";
        }
    }

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
        authorName.textContent = chapter.author || "Usuário desconhecido";
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

renderChapters().then(showAdminLink);
