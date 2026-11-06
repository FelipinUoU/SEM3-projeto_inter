import { createAuthorIcon } from "./authorIcon.js";
import { setExpandableDescription } from "./expandableDescription.js";
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
const workFormat = document.querySelector("#workFormat");
const workGenres = document.querySelector("#workGenres");
const workCover = document.querySelector("#workCover");
const workCoverPreview = document.querySelector("#workCoverPreview");
const workCoverPreviewImage = document.querySelector("#workCoverPreviewImage");
const favoriteButton = document.querySelector("#favoriteButton");
const favoriteFeedback = document.querySelector("#favoriteFeedback");
let currentWork;
let currentUser;

workCover.addEventListener("click", () => {
    const coverImage = workCover.querySelector("img");
    if (!coverImage) return;
    workCoverPreviewImage.src = coverImage.src;
    workCoverPreviewImage.alt = coverImage.alt;
    workCoverPreview.showModal();
});

document.querySelector(".work-cover-preview-close").addEventListener("click", () => {
    workCoverPreview.close();
});

workCoverPreview.addEventListener("click", (event) => {
    if (event.target === workCoverPreview) workCoverPreview.close();
});

workCoverPreview.addEventListener("close", () => {
    workCover.focus();
});

const chapterLanguages = {
    "pt-BR": {
        name: "Português (Brasil)",
        flag: "🇧🇷",
        artwork: '<rect width="30" height="20" fill="#009b3a"/><path d="M15 2 27 10 15 18 3 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.3" fill="#002776"/>'
    },
    ja: {
        name: "Japonês",
        flag: "🇯🇵",
        artwork: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>'
    },
    en: {
        name: "Inglês",
        flag: "🇺🇸",
        artwork: '<rect width="30" height="20" fill="#fff"/><path fill="#b22234" d="M0 0h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30V7.7H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0zm0 3.08h30v1.54H0z"/><path fill="#3c3b6e" d="M0 0h13v10.77H0z"/><path fill="#fff" d="m2 2 1 .8 1-.8-.4 1.2L5 4H3.7l-.7 1-.1-1H1.5l1-.8zM7 2l1 .8 1-.8-.4 1.2L10 4H8.7L8 5l-.1-1H6.5l1-.8zM2 6l1 .8 1-.8-.4 1.2L5 8H3.7L3 9l-.1-1H1.5l1-.8zM7 6l1 .8 1-.8-.4 1.2L10 8H8.7L8 9l-.1-1H6.5l1-.8z"/>'
    },
    es: {
        name: "Espanhol",
        flag: "🇪🇸",
        artwork: '<rect width="30" height="20" fill="#aa151b"/><path fill="#f1bf00" d="M0 5h30v10H0z"/>'
    },
    fr: {
        name: "Francês",
        flag: "🇫🇷",
        artwork: '<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>'
    },
    ko: {
        name: "Coreano",
        flag: "🇰🇷",
        artwork: '<rect width="30" height="20" fill="#fff"/><path d="M15 4a3 3 0 0 1 0 6 3 3 0 0 0 0 6 6 6 0 0 0 0-12" fill="#cd2e3a"/><path d="M15 4a3 3 0 0 0 0 6 3 3 0 0 1 0 6 6 6 0 0 1 0-12" fill="#0047a0"/><path stroke="#111" stroke-width="1.1" d="m4 5 5 2M3.5 7l5 2m16-4-5 2m6 0-5 2M4 15l5-2m-5 4 5-2m16 0-5-2m6 0-5-2"/>'
    },
    "zh-CN": {
        name: "Chinês (simplificado)",
        flag: "🇨🇳",
        artwork: '<rect width="30" height="20" fill="#de2910"/><path fill="#ffde00" d="m6 3 1.2 2.4 2.6.4-1.9 1.8.5 2.6L6 9l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>'
    },
    "zh-TW": {
        name: "Chinês (tradicional)",
        flag: "🇹🇼",
        artwork: '<rect width="30" height="20" fill="#fe0000"/><path fill="#000095" d="M0 0h13v11H0z"/><circle cx="6.5" cy="5.5" r="3" fill="#fff"/><circle cx="6.5" cy="5.5" r="1.4" fill="#000095"/>'
    }
};

function getGenres(work) {
    const value = work.gender ?? work.Gender ?? [];
    const values = Array.isArray(value) ? value : String(value).split(/[,;]/);
    return [...new Set(values.map((genre) => String(genre).trim()).filter(Boolean))];
}

function getWorkFormat(value) {
    const normalized = String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");

    if (["hq", "hqs", "quadrinho", "quadrinhos"].includes(normalized)) {
        return { value: "hq", label: "HQs" };
    }
    if (["manhwa", "manhwas"].includes(normalized)) {
        return { value: "manhwa", label: "Manhwas" };
    }
    if (["manga", "mangas"].includes(normalized)) {
        return { value: "manga", label: "Mangás" };
    }
    return null;
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
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos");
    favoriteButton.title = isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos";
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
    if (!Array.isArray(data.works)) throw new Error("A resposta do Neon PostgreSQL contém uma lista de obras inválida.");

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
        setExpandableDescription(workDescription, error.message || "Não foi possível carregar os dados do Neon PostgreSQL.");
        workAuthor.textContent = "";
        favoriteButton.disabled = true;
        return;
    }

    if (!work) {
        workTitle.textContent = "Obra não encontrada";
        setExpandableDescription(workDescription, "Selecione uma obra cadastrada para continuar.");
        workAuthor.textContent = "";
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Nenhuma obra cadastrada. Adicione uma obra pelo gerenciamento.";
        chapterList.append(emptyState);
        favoriteButton.disabled = true;
        return;
    }

    currentWork = work;
    workTitle.textContent = work.title;
    setExpandableDescription(workDescription, work.description || "Sem descrição.");
    workAuthor.textContent = work.author || "Autor não informado";
    const format = getWorkFormat(work.formato);
    workFormat.hidden = !format;
    if (format) {
        workFormat.href = `/HTML/Catalogo.html?formato=${encodeURIComponent(format.value)}`;
        workFormat.textContent = format.label;
        workFormat.setAttribute("aria-label", `Ver obras no formato ${format.label}`);
    } else {
        workFormat.removeAttribute("href");
        workFormat.removeAttribute("aria-label");
        workFormat.textContent = "";
    }
    workGenres.replaceChildren(...getGenres(work).map((genre) => {
        const link = document.createElement("a");
        link.className = "work-genre-link";
        link.href = `/HTML/Catalogo.html?genero=${encodeURIComponent(genre)}`;
        link.textContent = genre;
        link.setAttribute("aria-label", `Ver obras do gênero ${genre}`);
        return link;
    }));
    if (work.cover) {
        const coverImage = document.createElement("img");
        coverImage.src = work.cover;
        coverImage.alt = `Capa de ${work.title}`;
        workCover.replaceChildren(coverImage);
        workCover.setAttribute("aria-label", `Ampliar capa de ${work.title}`);
        workCover.disabled = false;
        workCover.hidden = false;
    }
    document.title = `${work.title} — Hub de Obra | HokuPédia`;
    if (!currentUser) {
        favoriteButton.textContent = "☆";
        favoriteButton.setAttribute("aria-label", "Entrar para favoritar");
        favoriteButton.title = "Entrar para favoritar";
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
    const chapterGroups = new Map();
    for (const [index, chapter] of work.chapters.entries()) {
        const number = Number.isInteger(chapter.number) && chapter.number > 0
            ? chapter.number
            : index + 1;
        const group = chapterGroups.get(number) || [];
        group.push({ chapter, index });
        chapterGroups.set(number, group);
    }

    for (const [number, versions] of chapterGroups) {
        const card = document.createElement("section");
        card.className = "chapter-card";
        const heading = document.createElement("h3");
        heading.className = "chapter-card-title";
        heading.textContent = `Capítulo ${number}`;
        card.append(heading);

        const languageList = document.createElement("div");
        languageList.className = "chapter-language-list";
        for (const { chapter, index } of versions) {
            const chapterId = chapter.id || `${work.id}-chapter-${index + 1}`;
            const chapterLanguage = chapter.language || "pt-BR";
            const language = chapterLanguages[chapterLanguage] || {
                name: chapterLanguage,
                flag: "🌐"
            };
            const link = document.createElement("a");
            link.className = "chapter-language-link";
            link.href = `/HTML/Leitura.html?obra=${encodeURIComponent(work.id)}&capitulo=${encodeURIComponent(chapterId)}`;
            const title = typeof chapter.title === "string" && chapter.title.trim()
                ? chapter.title.trim()
                : "Sem título";
            link.setAttribute("aria-label", `Abrir Capítulo ${number}: ${title} em ${language.name}`);
            if (openedChapters.has(`${work.id}:${chapterId}`)) {
                link.classList.add("chapter-card--opened");
            }

            const flag = document.createElement("span");
            flag.className = "chapter-flag";
            flag.setAttribute("aria-hidden", "true");
            flag.textContent = language.flag;
            if (language.artwork) {
                const flagArtwork = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                flagArtwork.classList.add("chapter-flag-artwork");
                flagArtwork.setAttribute("viewBox", "0 0 30 20");
                flagArtwork.setAttribute("focusable", "false");
                flagArtwork.innerHTML = language.artwork;
                flag.append(flagArtwork);
            }

            const chapterVersionTitle = document.createElement("span");
            chapterVersionTitle.className = "chapter-version-title";
            chapterVersionTitle.textContent = title;
            chapterVersionTitle.title = title;

            const author = document.createElement("span");
            author.className = "chapter-author";
            if (openedChapters.has(`${work.id}:${chapterId}`)) {
                const readBadge = document.createElement("span");
                readBadge.className = "chapter-read-badge";
                readBadge.textContent = "Já aberto";
                readBadge.setAttribute("aria-label", "Você já abriu este capítulo");
                author.append(readBadge);
            }
            author.append(createAuthorIcon());
            const authorName = document.createElement("span");
            authorName.textContent = chapter.author || "Usuário desconhecido";
            author.append(authorName);

            const contributor = document.createElement("span");
            contributor.className = "chapter-contributor";
            contributor.append(author);

            const arrow = document.createElement("span");
            arrow.className = "chapter-arrow";
            arrow.setAttribute("aria-hidden", "true");
            arrow.textContent = "›";
            link.append(flag, chapterVersionTitle, contributor, arrow);
            languageList.append(link);
        }
        card.append(languageList);
        chapterList.append(card);
    }
}

renderChapters();
