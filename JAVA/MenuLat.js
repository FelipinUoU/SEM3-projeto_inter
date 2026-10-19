const menuButton = document.getElementById("menuBtn");
const dashboard = document.getElementById("dashboard");
const overlay = document.getElementById("menuOverlay");
const dashboardItems = document.querySelectorAll(".menu-lateral-item");

function setDashboardOpen(isOpen) {
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

menuButton.addEventListener("click", () => {
    setDashboardOpen(menuButton.getAttribute("aria-expanded") !== "true");
});

overlay.addEventListener("click", () => setDashboardOpen(false));

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
        setDashboardOpen(false);
    }
});

dashboardItems.forEach((item) => {
    item.addEventListener("click", () => {
        window.location.href = item.dataset.href;
    });
});

const categoryFilters = document.querySelectorAll("[data-category-filter]");
const catalogCards = document.querySelectorAll(".obra-card[data-category]");
const catalogSections = document.querySelectorAll(".catalogo > section");
const searchForm = document.querySelector(".barra-pesquisa");
const searchInput = searchForm?.querySelector('input[type="search"]');
const emptyCatalogMessage = document.querySelector(".catalogo-vazio");
let selectedCategory = "all";

function filterCatalog() {
    const query = searchInput?.value.trim().toLocaleLowerCase("pt-BR") ?? "";

    catalogCards.forEach((card) => {
        const matchesCategory = selectedCategory === "all" || card.dataset.category === selectedCategory;
        const matchesSearch = card.textContent.toLocaleLowerCase("pt-BR").includes(query);
        card.hidden = !matchesCategory || !matchesSearch;
    });

    catalogSections.forEach((section) => {
        section.hidden = !section.querySelector(".obra-card:not([hidden])");
    });

    if (emptyCatalogMessage) {
        emptyCatalogMessage.hidden = Array.from(catalogCards).some((card) => !card.hidden);
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
