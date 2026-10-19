const menuButton = document.getElementById("menuBtn");
const dashboard = document.getElementById("dashboard");
const closeButton = document.getElementById("closeDashboard");
const overlay = document.getElementById("menuOverlay");
const dashboardItems = document.querySelectorAll(".menu-lateral-item");
const selectionMessage = document.getElementById("dashboardSelection");

function setDashboardOpen(isOpen) {
    dashboard.classList.toggle("open", isOpen);
    dashboard.setAttribute("aria-hidden", String(!isOpen));
    dashboard.inert = !isOpen;
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Fechar dashboard" : "Abrir dashboard");
    overlay.hidden = !isOpen;

    if (isOpen) {
        closeButton.focus();
    } else {
        menuButton.focus();
    }
}

menuButton.addEventListener("click", () => {
    setDashboardOpen(menuButton.getAttribute("aria-expanded") !== "true");
});

closeButton.addEventListener("click", () => setDashboardOpen(false));
overlay.addEventListener("click", () => setDashboardOpen(false));

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
        setDashboardOpen(false);
    }
});

dashboardItems.forEach((item) => {
    item.addEventListener("click", () => {
        const destination = item.dataset.href;
        if (destination) {
            window.location.href = destination;
            return;
        }

        dashboardItems.forEach((dashboardItem) => {
            dashboardItem.setAttribute("aria-pressed", String(dashboardItem === item));
        });
        if (selectionMessage) {
            selectionMessage.textContent = `Item ${item.textContent.trim()} selecionado.`;
        }
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

document.querySelectorAll(".novidades, .capnovos, .recomendados").forEach((carrossel) => {
    const janela = carrossel.querySelector(".novidades-janela");
    const faixa = carrossel.querySelector(".novidades-faixa");
    const [anterior, proxima] = carrossel.querySelectorAll(".novidades-botao");

    if (!janela || !faixa || !anterior || !proxima) {
        return;
    }

    const paginas = Array.from(faixa.querySelectorAll(".novidades-pagina"))
        .filter((pagina) => pagina.querySelector("img"));
    let indicePagina = 0;

    function atualizarCarrossel() {
        faixa.style.transform = `translateX(${-indicePagina * janela.clientWidth}px)`;
        anterior.disabled = indicePagina === 0;
        proxima.disabled = indicePagina >= paginas.length - 1;
    }

    anterior.addEventListener("click", () => {
        if (indicePagina > 0) {
            indicePagina -= 1;
            atualizarCarrossel();
        }
    });

    proxima.addEventListener("click", () => {
        if (indicePagina < paginas.length - 1) {
            indicePagina += 1;
            atualizarCarrossel();
        }
    });

    window.addEventListener("resize", atualizarCarrossel);
    atualizarCarrossel();
});
