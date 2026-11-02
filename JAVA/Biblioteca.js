import fallbackCover from "../Img/Capa.jpg";
import { getCurrentLibraryUser, loadUserLibrary } from "../JS/userLibrary.js";

const latestReadGrid = document.getElementById("latestReadGrid");
const readingHistoryGrid = document.getElementById("readingHistoryGrid");
const favoritesGrid = document.getElementById("favoritesGrid");
const libraryStatus = document.getElementById("libraryStatus");
const nicknameInput = document.getElementById("nicknameInput");
const nicknameText = document.getElementById("nicknameText");
const nicknameEditButton = document.getElementById("nicknameEditButton");
const readingCount = document.getElementById("readingCount");
let nickname = "";

function showEmptyState(container, message) {
    const emptyState = document.createElement("p");
    emptyState.className = "library-empty-state";
    emptyState.textContent = message;
    container.replaceChildren(emptyState);
}

function getChapterLabel(work, chapterId) {
    const chapter = work.chapters.find((item) => item.id === chapterId);
    if (!chapter) return "Último capítulo não disponível";
    const number = Number.isInteger(chapter.number) ? chapter.number : "";
    const title = typeof chapter.title === "string" ? chapter.title.trim() : "";
    return `Capítulo ${number}${title ? ` — ${title}` : ""}`;
}

function createWorkCard(work, readEntry, favorite = false) {
    const card = document.createElement("article");
    card.className = "library-card";

    const link = document.createElement("a");
    link.className = "library-card-link";
    link.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
    link.setAttribute("aria-label", `Abrir ${work.title}`);

    const cover = document.createElement("img");
    cover.className = "library-card-cover";
    cover.src = work.cover || fallbackCover;
    cover.alt = `Capa de ${work.title}`;
    cover.loading = "lazy";
    cover.addEventListener("error", () => {
        cover.src = fallbackCover;
    }, { once: true });

    const content = document.createElement("span");
    content.className = "library-card-content";
    const title = document.createElement("strong");
    title.className = "library-card-title";
    title.textContent = work.title;
    const detail = document.createElement("span");
    detail.className = "library-card-detail";
    detail.textContent = readEntry
        ? getChapterLabel(work, readEntry.chapterId)
        : favorite ? "Obra favorita" : "Sem capítulo lido";
    content.append(title, detail);
    link.append(cover, content);
    card.append(link);
    return card;
}

function renderWorkGrid(container, entries, worksById, emptyMessage) {
    const cards = entries
        .map((entry) => {
            const workId = typeof entry === "string" ? entry : entry.workId;
            const work = worksById.get(workId);
            return work ? createWorkCard(
                work,
                typeof entry === "string" ? null : entry,
                typeof entry === "string"
            ) : null;
        })
        .filter(Boolean);

    if (cards.length) container.replaceChildren(...cards);
    else showEmptyState(container, emptyMessage);
}

function setLibraryUnavailable(message, loginRequired = false) {
    libraryStatus.replaceChildren(document.createTextNode(message));
    if (loginRequired) {
        const loginLink = document.createElement("a");
        loginLink.href = "/HTML/CadLog.html?mode=login";
        loginLink.textContent = "Entrar";
        libraryStatus.append(" ", loginLink, " para ver sua biblioteca.");
    }
}

async function renderLibrary() {
    libraryStatus.textContent = "Carregando biblioteca...";
    try {
        const user = await getCurrentLibraryUser();
        if (!user) {
            setLibraryUnavailable("Entre na sua conta para acessar a biblioteca personalizada.", true);
            [latestReadGrid, readingHistoryGrid, favoritesGrid].forEach((grid) => (
                showEmptyState(grid, "Entre na sua conta para ver este conteúdo.")
            ));
            nickname = "Minha biblioteca";
            nicknameText.textContent = nickname;
            readingCount.textContent = "0 obras lidas";
            return;
        }

        const [response, library] = await Promise.all([
            fetch("/api/works"),
            Promise.resolve(loadUserLibrary(user.$id))
        ]);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as obras.");
        if (!Array.isArray(data.works)) throw new Error("A lista de obras retornada é inválida.");

        const worksById = new Map(data.works.map((work) => [work.id, work]));
        const readingHistory = [...library.readingHistory]
            .sort((left, right) => right.readAt - left.readAt)
            .filter((entry) => worksById.has(entry.workId));
        const favorites = library.favorites.filter((workId) => worksById.has(workId));

        nickname = user.name || "Minha biblioteca";
        nicknameText.textContent = nickname;
        readingCount.textContent = `${readingHistory.length} ${readingHistory.length === 1 ? "obra lida" : "obras lidas"}`;
        libraryStatus.textContent = "";
        renderWorkGrid(
            latestReadGrid,
            readingHistory.slice(0, 3),
            worksById,
            "Você ainda não leu nenhuma obra."
        );
        renderWorkGrid(
            readingHistoryGrid,
            readingHistory,
            worksById,
            "Seu histórico de leitura está vazio."
        );
        renderWorkGrid(
            favoritesGrid,
            favorites,
            worksById,
            "Você ainda não adicionou obras aos favoritos."
        );
    } catch (error) {
        console.error("Não foi possível carregar a biblioteca:", error);
        setLibraryUnavailable(error.message || "Não foi possível carregar sua biblioteca.");
        [latestReadGrid, readingHistoryGrid, favoritesGrid].forEach((grid) => (
            showEmptyState(grid, "Não foi possível carregar este conteúdo.")
        ));
    }
}

if (nicknameInput && nicknameText && nicknameEditButton) {
    function closeNicknameEditor() {
        nickname = nicknameInput.value.trim();
        nicknameText.textContent = nickname || "Minha biblioteca";
        nicknameInput.hidden = true;
        nicknameEditButton.setAttribute("aria-expanded", "false");
    }

    nicknameEditButton.addEventListener("click", () => {
        nicknameInput.value = nickname;
        nicknameInput.hidden = false;
        nicknameEditButton.setAttribute("aria-expanded", "true");
        nicknameInput.focus();
    });

    nicknameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            closeNicknameEditor();
            nicknameEditButton.focus();
        }
    });

    nicknameInput.addEventListener("blur", closeNicknameEditor);
}

renderLibrary();
