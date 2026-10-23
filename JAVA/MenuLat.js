const menuButton = document.getElementById("menuBtn");
const dashboard = document.getElementById("dashboard");
const overlay = document.getElementById("menuOverlay");
const dashboardItems = document.querySelectorAll(".menu-lateral-item");

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
const carouselStates = Array.from(document.querySelectorAll("[data-carousel]"), (carousel) => ({
    carousel,
    track: carousel.querySelector(".obras-faixa"),
    previous: carousel.querySelector("[data-carousel-previous]"),
    next: carousel.querySelector("[data-carousel-next]"),
    selectedIndex: 0
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
        ? Math.floor(visibleCards.length / 2)
        : Math.min(state.selectedIndex, Math.max(visibleCards.length - 1, 0));

    cards.forEach((card) => {
        const index = visibleCards.indexOf(card);
        const isSelected = index === state.selectedIndex && index !== -1;
        card.setAttribute("aria-current", String(isSelected));
        card.tabIndex = isSelected ? 0 : -1;
    });

    const centeredStart = Math.max(0, state.selectedIndex - Math.floor(visibleSlots / 2));
    const maxStart = Math.max(0, visibleCards.length - slots);
    const startIndex = Math.min(centeredStart, maxStart);
    if (visibleCards.length > slots && visibleCards[0]) {
        const gap = Number.parseFloat(window.getComputedStyle(state.track).columnGap) || 0;
        const cardWidth = visibleCards[0].getBoundingClientRect().width;
        state.track.style.transform = `translateX(-${startIndex * (cardWidth + gap)}px)`;
    } else {
        state.track.style.transform = "";
    }

    state.previous.disabled = visibleCards.length < 2 || state.selectedIndex === 0;
    state.next.disabled = visibleCards.length < 2 || state.selectedIndex >= visibleCards.length - 1;
}

carouselStates.forEach((state) => {
    state.previous.addEventListener("click", () => {
        state.selectedIndex -= 1;
        updateCarousel(state);
    });
    state.next.addEventListener("click", () => {
        state.selectedIndex += 1;
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
        const matchesCategory = selectedCategory === "all" || card.dataset.category === selectedCategory;
        const matchesSearch = card.textContent.toLocaleLowerCase("pt-BR").includes(query);
        card.hidden = !matchesCategory || !matchesSearch;
    });

    catalogSections.forEach((section) => {
        section.hidden = !section.querySelector(".obra-card:not([hidden])");
    });

    carouselStates.forEach((state) => updateCarousel(state, true));

    if (emptyCatalogMessage) {
        emptyCatalogMessage.hidden = Array.from(catalogCards).some((card) => !card.hidden);
    }
}

async function loadCommunityWorks() {
    const track = document.querySelector("[data-community-works]");
    const status = document.getElementById("communityWorksStatus");
    if (!track || !status) return;

    try {
        const response = await fetch("/api/works");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as obras.");
        if (!Array.isArray(data.works)) throw new Error("A resposta do servidor contém uma lista de obras inválida.");

        track.replaceChildren();
        for (const work of data.works) {
            const card = document.createElement("article");
            card.className = "obra-card";
            card.dataset.workId = work.id;
            card.dataset.category = "manga";
            card.dataset.href = `/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`;
            card.tabIndex = 0;

            const cover = document.createElement("img");
            cover.src = work.cover || "/Img/Capa.jpg";
            cover.alt = `Capa de ${work.title}`;
            card.append(cover);

            const title = document.createElement("h3");
            title.textContent = work.title;
            card.append(title);

            const author = document.createElement("p");
            author.textContent = work.author || "Obra da comunidade";
            card.append(author);
            track.append(card);
        }
        status.textContent = data.works.length ? "" : "Nenhuma obra cadastrada pela comunidade.";
        filterCatalog();
    } catch (error) {
        console.error("Não foi possível carregar as obras da comunidade:", error);
        status.textContent = error.message || "Não foi possível carregar as obras da comunidade.";
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


filterCatalog();
void loadCommunityWorks();
window.addEventListener("resize", () => {
    carouselStates.forEach((state) => updateCarousel(state));
});
