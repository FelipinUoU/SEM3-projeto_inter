import { account } from "../JS/JAVA/appwriteClient.js";
import "./AuthHeader.js";

const adminEmail = "hokupedia@gmail.com";
const menuButton = document.getElementById("menuBtn");
const dashboard = document.getElementById("dashboard");
const overlay = document.getElementById("menuOverlay");
const dashboardItems = document.querySelectorAll(".menu-lateral-item");
const navigation = document.querySelector(".menu-lateral-items");

async function updateNavigationForUser() {
    try {
        const user = await account.get();
        if (!navigation) return;
        const isAdmin = user.email?.trim().toLowerCase() === adminEmail
            || user.labels?.includes("admin");
        const isModerator = isAdmin || user.labels?.includes("moderator");
        navigation.querySelectorAll("[data-role-navigation]").forEach((link) => link.remove());
        navigation.querySelectorAll("[data-admin-only]").forEach((link) => {
            link.hidden = !isAdmin;
        });

        const existingManageWorksLink = navigation.querySelector('a[href="/HTML/GerenciarObras.html"]');
        const manageWorksLink = existingManageWorksLink || document.createElement("a");
        manageWorksLink.classList.add("menu-lateral-item");
        manageWorksLink.textContent = isModerator ? "Gerenciar Obras" : "Solicitar moderação";
        manageWorksLink.hidden = false;
        if (!existingManageWorksLink) {
            manageWorksLink.href = "/HTML/GerenciarObras.html";
            manageWorksLink.dataset.roleNavigation = "works";
            navigation.querySelector('a[href="/HTML/Biblioteca.html"]')
                ?.insertAdjacentElement("afterend", manageWorksLink);
        }

        const existingApprovalLink = navigation.querySelector('a[href="/HTML/Homologacao.html"]');
        if (existingApprovalLink) existingApprovalLink.hidden = !isAdmin;
        if (isAdmin && !existingApprovalLink) {
            const approvalLink = document.createElement("a");
            approvalLink.className = "menu-lateral-item";
            approvalLink.href = "/HTML/Homologacao.html";
            approvalLink.textContent = "Homologação";
            approvalLink.dataset.roleNavigation = "approval";
            manageWorksLink.insertAdjacentElement("afterend", approvalLink);
        }
    } catch (error) {
        navigation?.querySelector('a[href="/HTML/GerenciarObras.html"]')?.setAttribute("hidden", "");
        navigation?.querySelectorAll("[data-admin-only]").forEach((link) => { link.hidden = true; });
        if (error.code === 401) {
            const libraryLink = navigation?.querySelector('a[href="/HTML/Biblioteca.html"]');
            if (libraryLink) libraryLink.href = "/HTML/CadLog.html";
        } else {
            console.error("Não foi possível verificar a sessão do usuário:", error);
        }
    }
}

void updateNavigationForUser();

function setDashboardOpen(isOpen) {
    if (!dashboard || !menuButton || !overlay) return;
    dashboard.classList.toggle("open", isOpen);
    dashboard.setAttribute("aria-hidden", String(!isOpen));
    dashboard.inert = !isOpen;
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Fechar dashboard" : "Abrir dashboard");
    overlay.hidden = !isOpen;

    if (isOpen) {
        dashboardItems[0]?.focus();
    } else {
        menuButton.focus();
    }
}

if (menuButton && dashboard && overlay) {
    menuButton.addEventListener("click", () => {
        setDashboardOpen(menuButton.getAttribute("aria-expanded") !== "true");
    });

    overlay.addEventListener("click", () => setDashboardOpen(false));

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
            setDashboardOpen(false);
        }
    });
}

const categoryFilters = document.querySelectorAll("[data-category-filter]");
const getCatalogCards = () => Array.from(document.querySelectorAll(".obra-card[data-category]"));
const catalogSections = document.querySelectorAll(".catalogo > section");
const searchForm = document.querySelector(".barra-pesquisa");
const searchInput = searchForm?.querySelector('input[type="search"]');
const emptyCatalogMessage = document.querySelector(".catalogo-vazio");
const homeCatalogStatus = document.getElementById("homeCatalogStatus");
const homeCarouselTracks = [
    document.querySelector('[aria-labelledby="titulo-novidades"] .obras-faixa'),
    document.querySelector('[aria-labelledby="titulo-obras-comunidade"] .obras-faixa'),
    document.querySelector('[aria-labelledby="titulo-capnovos"] .obras-faixa'),
    document.querySelector('[aria-labelledby="titulo-recomendados"] .obras-faixa')
];

const carouselStates = Array.from(document.querySelectorAll("[data-carousel]"), (carousel) => ({
    carousel,
    track: carousel.querySelector(".obras-faixa"),
    previous: carousel.querySelector("[data-carousel-previous]"),
    next: carousel.querySelector("[data-carousel-next]"),
    selectedIndex: 0,
    startIndex: 0
}));
let selectedCategory = "all";

function updateCarousel(state, resetSelection = false) {
    const cards = Array.from(state.track.querySelectorAll(".obra-card"));
    const visibleCards = cards.filter((card) => !card.hidden);
    const slots = window.matchMedia("(max-width: 520px)").matches
        ? 2
        : window.matchMedia("(max-width: 760px)").matches ? 3 : 5;
    const visibleSlots = Math.min(slots, visibleCards.length);

    state.track.style.setProperty("--carousel-slots", String(Math.max(visibleSlots, 1)));
    state.track.classList.toggle("is-short", visibleCards.length <= slots);
    state.selectedIndex = resetSelection
        ? 0
        : Math.max(0, Math.min(state.selectedIndex, Math.max(visibleCards.length - 1, 0)));
    const maxStart = Math.max(0, visibleCards.length - slots);
    const navigationMaxStart = maxStart + (maxStart % 2);
    state.startIndex = resetSelection
        ? 0
        : Math.max(0, Math.min(state.startIndex, navigationMaxStart));

    if (state.selectedIndex < state.startIndex) {
        state.startIndex = Math.floor(state.selectedIndex / 2) * 2;
    } else if (state.selectedIndex >= state.startIndex + visibleSlots) {
        const requiredStart = state.selectedIndex - visibleSlots + 1;
        state.startIndex = Math.min(Math.ceil(requiredStart / 2) * 2, navigationMaxStart);
    }

    cards.forEach((card) => {
        const index = visibleCards.indexOf(card);
        const isSelected = index === state.selectedIndex && index !== -1;
        card.setAttribute("aria-current", String(isSelected));
        card.tabIndex = isSelected ? 0 : -1;
    });

    if (visibleCards.length > slots && visibleCards[0]) {
        const gap = Number.parseFloat(window.getComputedStyle(state.track).columnGap) || 0;
        const cardWidth = visibleCards[0].getBoundingClientRect().width;
        state.track.style.transform = `translateX(-${state.startIndex * (cardWidth + gap)}px)`;
    } else {
        state.track.style.transform = "";
    }

    state.previous.disabled = visibleCards.length < 2 || state.startIndex === 0;
    state.next.disabled = visibleCards.length < 2;
}

function normalizeWorkFormat(value) {
    const normalized = String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");

    if (["hq", "hqs", "quadrinho", "quadrinhos"].includes(normalized)) return "hq";
    if (["manhwa", "manhwas"].includes(normalized)) return "manhwa";
    if (["manga", "mangas"].includes(normalized)) return "manga";
    return "";
}

function createWorkCard(work, subtitle) {
    const card = document.createElement("article");
    card.className = "obra-card";
    card.dataset.workId = work.id;
    card.dataset.category = normalizeWorkFormat(work.formato);
    card.dataset.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
    card.tabIndex = 0;

    if (work.cover) {
        const cover = document.createElement("img");
        cover.src = work.cover;
        cover.alt = `Capa de ${work.title}`;
        card.append(cover);
    }

    const title = document.createElement("h3");
    title.textContent = work.title;
    card.append(title);

    const details = document.createElement("p");
    details.textContent = subtitle || "Obra publicada";
    card.append(details);
    return card;
}

function getLatestPublishedChapter(work) {
    return (Array.isArray(work.chapters) ? work.chapters : [])
        .filter((chapter) => chapter.status === "published")
        .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""))
        .at(0);
}

function sortWorksByCreationDate(works) {
    return [...works].sort((left, right) => {
        const leftDate = Date.parse(left.createdAt || "");
        const rightDate = Date.parse(right.createdAt || "");
        return (Number.isFinite(rightDate) ? rightDate : 0)
            - (Number.isFinite(leftDate) ? leftDate : 0);
    });
}

carouselStates.forEach((state) => {
    state.previous.addEventListener("click", () => {
        state.startIndex -= 2;
        state.selectedIndex = state.startIndex;
        updateCarousel(state);
    });
    state.next.addEventListener("click", () => {
        state.startIndex += 2;
        state.selectedIndex = state.startIndex;
        updateCarousel(state);
    });

    state.track.addEventListener("click", (event) => {
        const card = event.target.closest(".obra-card");
        if (!card || card.hidden) return;
        state.selectedIndex = Array.from(state.track.querySelectorAll(".obra-card"))
            .filter((item) => !item.hidden)
            .indexOf(card);
        updateCarousel(state);
        if (card.dataset.href) window.location.href = card.dataset.href;
    });

    state.track.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const card = event.target.closest(".obra-card");
        if (!card || card.hidden) return;
        event.preventDefault();
        state.selectedIndex = Array.from(state.track.querySelectorAll(".obra-card"))
            .filter((item) => !item.hidden)
            .indexOf(card);
        updateCarousel(state);
        if (card.dataset.href) window.location.href = card.dataset.href;
    });
});

function filterCatalog() {
    const query = searchInput?.value.trim().toLocaleLowerCase("pt-BR") ?? "";

    const catalogCards = getCatalogCards();
    catalogCards.forEach((card) => {
        const matchesCategory = selectedCategory === "all"
            || card.dataset.category === "all"
            || card.dataset.category === selectedCategory;
        const matchesSearch = card.textContent.toLocaleLowerCase("pt-BR").includes(query);
        card.hidden = !matchesCategory || !matchesSearch;
    });

    catalogSections.forEach((section) => {
        section.hidden = !section.querySelector(".obra-card:not([hidden])");
    });

    carouselStates.forEach((state) => updateCarousel(state, true));

    if (emptyCatalogMessage) {
        emptyCatalogMessage.hidden = catalogCards.length === 0
            || Array.from(catalogCards).some((card) => !card.hidden);
    }
}

async function loadHomeWorks() {
    if (!homeCatalogStatus || homeCarouselTracks.some((track) => !track)) {
        console.error("Não foi possível inicializar as seções de obras da página inicial.");
        return;
    }

    homeCarouselTracks.forEach((track) => track.replaceChildren());
    catalogSections.forEach((section) => {
        section.hidden = true;
    });
    homeCatalogStatus.textContent = "Carregando obras...";
    homeCatalogStatus.hidden = false;

    try {
        const response = await fetch("/api/works");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as obras.");
        if (!Array.isArray(data.works)) {
            throw new Error("A resposta do servidor contém uma lista de obras inválida.");
        }

        const works = sortWorksByCreationDate(data.works);
        const newestFirst = works.map((work) => createWorkCard(work, work.author));
        const communityWorks = works.map((work) => createWorkCard(work, work.author));
        const newestChaptersFirst = [...works].sort((left, right) => {
            const leftDate = Date.parse(getLatestPublishedChapter(left)?.createdAt || "");
            const rightDate = Date.parse(getLatestPublishedChapter(right)?.createdAt || "");
            return (Number.isFinite(rightDate) ? rightDate : 0)
                - (Number.isFinite(leftDate) ? leftDate : 0);
        });
        const newChapters = newestChaptersFirst.map((work) => {
            const chapter = getLatestPublishedChapter(work);
            const chapterDetails = chapter
                ? `Capítulo ${chapter.number}${chapter.title ? ` — ${chapter.title}` : ""}`
                : "Sem capítulos publicados";
            return createWorkCard(work, chapterDetails);
        });
        const recommendations = works.map((work) => createWorkCard(work, work.author));

        [newestFirst, communityWorks, newChapters, recommendations].forEach((cards, index) => {
            homeCarouselTracks[index].replaceChildren(...cards);
        });

        homeCatalogStatus.textContent = works.length ? "" : "Nenhuma obra publicada foi encontrada.";
        homeCatalogStatus.hidden = works.length > 0;
        filterCatalog();
    } catch (error) {
        console.error("Não foi possível carregar as obras da página inicial:", error);
        homeCatalogStatus.textContent = error.message || "Não foi possível carregar as obras.";
        homeCatalogStatus.hidden = false;
    }
}

categoryFilters.forEach((filter) => {
    filter.addEventListener("click", () => {
        selectedCategory = filter.dataset.categoryFilter;
        categoryFilters.forEach((button) => {
            button.setAttribute("aria-pressed", String(button === filter));
        });
        filterCatalog();
    });
});

searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    filterCatalog();
});
searchInput?.addEventListener("input", filterCatalog);

if (homeCatalogStatus) void loadHomeWorks();
window.addEventListener("resize", () => {
    carouselStates.forEach((state) => updateCarousel(state));
});
