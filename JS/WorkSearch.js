const searchForm = document.querySelector(".work-search");
const searchInput = searchForm?.querySelector('input[type="search"]');
const searchResults = searchForm?.querySelector(".work-search__results");
let publishedWorks = [];
let activeResultIndex = -1;

function normalizeSearchValue(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function closeSearchResults() {
    if (!searchResults || !searchInput) return;
    searchResults.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
    activeResultIndex = -1;
}

function openSearchResults() {
    if (!searchResults || !searchInput) return;
    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
}

function navigateToWork(work) {
    window.location.assign(`/HTML/Obra.html?obra=${encodeURIComponent(work.id)}`);
}

function renderSearchResults() {
    if (!searchInput || !searchResults) return;
    const query = normalizeSearchValue(searchInput.value);
    searchResults.replaceChildren();
    activeResultIndex = -1;

    if (!query) {
        closeSearchResults();
        return;
    }

    const matches = publishedWorks.filter((work) =>
        normalizeSearchValue(work.title).includes(query)
    );

    if (matches.length === 0) {
        searchResults.setAttribute("role", "status");
        const message = document.createElement("p");
        message.className = "work-search__empty";
        message.textContent = "Nenhuma obra encontrada.";
        searchResults.append(message);
        openSearchResults();
        return;
    }

    searchResults.setAttribute("role", "listbox");
    for (const work of matches) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "work-search__option";
        option.setAttribute("role", "option");
        option.textContent = work.title;
        option.addEventListener("click", () => navigateToWork(work));
        searchResults.append(option);
    }
    openSearchResults();
}

async function loadPublishedWorks() {
    const response = await fetch("/api/works");
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
        throw new Error(data?.error || `Não foi possível carregar as obras (HTTP ${response.status}).`);
    }
    if (!Array.isArray(data?.works)
        || data.works.some((work) => !work || typeof work.id !== "string" || typeof work.title !== "string")) {
        throw new Error("A resposta do servidor contém uma lista de obras inválida.");
    }
    publishedWorks = data.works;
    if (searchInput?.value.trim()) renderSearchResults();
}

if (searchForm && searchInput && searchResults) {
    searchInput.addEventListener("input", renderSearchResults);
    searchInput.addEventListener("keydown", (event) => {
        const options = [...searchResults.querySelectorAll(".work-search__option")];
        if (event.key === "Escape") {
            closeSearchResults();
        } else if (event.key === "ArrowDown" && options.length > 0) {
            event.preventDefault();
            activeResultIndex = (activeResultIndex + 1) % options.length;
            options[activeResultIndex].focus();
        } else if (event.key === "Enter" && options.length > 0) {
            event.preventDefault();
            navigateToWork(publishedWorks.filter((work) =>
                normalizeSearchValue(work.title).includes(normalizeSearchValue(searchInput.value))
            )[0]);
        }
    });
    searchResults.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const options = [...searchResults.querySelectorAll(".work-search__option")];
        if (options.length === 0) return;
        event.preventDefault();
        activeResultIndex = (activeResultIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length)
            % options.length;
        options[activeResultIndex].focus();
    });
    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const query = normalizeSearchValue(searchInput.value);
        if (!query) {
            closeSearchResults();
            return;
        }
        const work = publishedWorks.find((item) => normalizeSearchValue(item.title).includes(query));
        if (work) navigateToWork(work);
        else renderSearchResults();
    });
    document.addEventListener("click", (event) => {
        if (!searchForm.contains(event.target)) closeSearchResults();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSearchResults();
    });

    void loadPublishedWorks().catch((error) => {
        console.error("Não foi possível carregar as obras para a busca:", error);
        if (searchInput.value.trim()) {
            searchResults.replaceChildren();
            searchResults.setAttribute("role", "status");
            const message = document.createElement("p");
            message.className = "work-search__empty";
            message.textContent = "Não foi possível carregar as obras.";
            searchResults.append(message);
            openSearchResults();
        }
    });
}
