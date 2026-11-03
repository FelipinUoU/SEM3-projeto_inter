import { loadPublicCatalog } from "./catalogCache.js";
import { normalizeWorkFormat } from "./workFormat.js";

const catalogGrid = document.querySelector("#catalogGrid");
const catalogStatus = document.querySelector("#catalogStatus");
const genreToggle = document.querySelector("#genreToggle");
const genrePanel = document.querySelector("#genrePanel");
const genreFilters = document.querySelector("#genreFilters");
const catalogFormatFilter = document.querySelector("#catalogFormatFilter");
const catalogFormatLabel = document.querySelector("#catalogFormatLabel");
const clearFormatFilter = document.querySelector("#clearFormatFilter");

let works = [];
let selectedGenre = new URLSearchParams(window.location.search).get("genero") || "";
let selectedFormat = new URLSearchParams(window.location.search).get("formato") || "";

function getFormatLabel(format) {
    return { hq: "HQs", manhwa: "Manhwas", manga: "Mangás" }[format] || "";
}

function getGenres(work) {
    const value = work.gender ?? work.Gender ?? work.genres ?? work.Genres ?? work.genre ?? work.Genre ?? [];
    const values = Array.isArray(value) ? value : String(value).split(/[,;]/);
    return values.map((genre) => String(genre).trim()).filter(Boolean);
}

function createEmptyState(message) {
    const empty = document.createElement("p");
    empty.className = "catalog-empty";
    empty.textContent = message;
    catalogGrid.replaceChildren(empty);
}

function renderGenres() {
    const genres = [...new Set(works.flatMap(getGenres))]
        .sort((left, right) => left.localeCompare(right, "pt-BR"));
    genreFilters.replaceChildren();

    if (genres.length === 0) {
        const empty = document.createElement("p");
        empty.className = "genre-empty";
        empty.textContent = "Nenhum gênero foi informado nas obras.";
        genreFilters.append(empty);
        return;
    }

    for (const genre of ["Todos", ...genres]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "genre-filter";
        button.textContent = genre;
        button.setAttribute("aria-pressed", String(
            genre === "Todos" ? !selectedGenre : selectedGenre === genre
        ));
        button.addEventListener("click", () => {
            selectedGenre = genre === "Todos" ? "" : genre;
            renderGenres();
            renderWorks();
        });
        genreFilters.append(button);
    }
}

function createWorkCard(work, index) {
    const card = document.createElement("article");
    card.className = "work-card";

    const link = document.createElement("a");
    link.className = "work-card-link";
    link.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
    link.setAttribute("aria-label", `Ver obra ${work.title}`);

    const cover = document.createElement("div");
    cover.className = "catalog-cover";
    const fallback = document.createElement("div");
    fallback.className = `catalog-cover-scene catalog-cover-art variation-${index % 4}`;
    fallback.setAttribute("aria-hidden", "true");
    cover.append(fallback);

    if (typeof work.cover === "string" && work.cover.trim()) {
        const image = document.createElement("img");
        image.src = work.cover;
        image.alt = `Capa de ${work.title}`;
        image.addEventListener("error", () => image.remove(), { once: true });
        cover.append(image);
    }
    link.append(cover);

    const details = document.createElement("div");
    details.className = "work-details";
    const title = document.createElement("h3");
    title.className = "work-title";
    title.textContent = work.title;
    details.append(title);

    const author = document.createElement("p");
    author.className = "work-author";
    author.textContent = work.author || "Autor não informado";
    details.append(author);

    const chapters = Array.isArray(work.chapters) ? work.chapters : [];
    const publishedChapterCount = chapters.filter((chapter) => chapter.status === "published").length;
    const chapterCount = document.createElement("p");
    chapterCount.className = "work-chapters";
    chapterCount.textContent = publishedChapterCount === 1
        ? "1 capítulo publicado"
        : `${publishedChapterCount} capítulos publicados`;
    details.append(chapterCount);

    link.append(details);
    card.append(link);
    return card;
}

function renderWorks() {
    catalogFormatFilter.hidden = !selectedFormat;
    catalogFormatLabel.textContent = selectedFormat
        ? `Formato selecionado: ${getFormatLabel(selectedFormat)}`
        : "";
    const filteredWorks = works.filter((work) => {
        const matchesGenre = !selectedGenre || getGenres(work).includes(selectedGenre);
        const matchesFormat = !selectedFormat || normalizeWorkFormat(work.formato) === selectedFormat;
        return matchesGenre && matchesFormat;
    });

    if (filteredWorks.length === 0) {
        createEmptyState(works.length
            ? "Nenhuma obra encontrada para os filtros selecionados."
            : "Ainda não há obras publicadas no catálogo.");
    } else {
        catalogGrid.replaceChildren(
            ...filteredWorks.map((work, index) => createWorkCard(work, index))
        );
    }

    catalogStatus.textContent = `${filteredWorks.length} ${filteredWorks.length === 1 ? "obra encontrada" : "obras encontradas"}`;
}

async function loadWorks() {
    const data = await loadPublicCatalog();
    works = data.works;
    selectedFormat = normalizeWorkFormat(selectedFormat);
    const genres = [...new Set(works.flatMap(getGenres))];
    selectedGenre = genres.find((genre) => genre.toLocaleLowerCase("pt-BR")
        === selectedGenre.toLocaleLowerCase("pt-BR")) || "";
    if (selectedGenre) {
        genreToggle.setAttribute("aria-expanded", "true");
        genrePanel.hidden = false;
    }
    renderGenres();
    renderWorks();
}

genreToggle.addEventListener("click", () => {
    const expanded = genreToggle.getAttribute("aria-expanded") === "true";
    genreToggle.setAttribute("aria-expanded", String(!expanded));
    genrePanel.hidden = expanded;
});

clearFormatFilter.addEventListener("click", () => {
    selectedFormat = "";
    const search = new URLSearchParams(window.location.search);
    search.delete("formato");
    const query = search.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
    renderWorks();
});

loadWorks().catch((error) => {
    console.error("Não foi possível carregar o catálogo:", error);
    catalogStatus.textContent = error.message || "Não foi possível carregar as obras.";
    catalogStatus.classList.add("is-error");
    createEmptyState("Tente novamente mais tarde.");
});
