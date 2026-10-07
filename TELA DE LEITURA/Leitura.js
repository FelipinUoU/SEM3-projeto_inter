(() => {
    const reader = document.getElementById("reader");
    const pageArea = document.getElementById("pageArea");
    const comicPage = document.getElementById("comicPage");
    const currentPageLabel = document.getElementById("currentPage");
    const topMenu = document.getElementById("topMenu");
    const menuTrigger = document.getElementById("menuTrigger");
    const resizeMenu = document.getElementById("resizeMenu");
    const resizeTrigger = document.getElementById("resizeTrigger");
    const pageImages = ["Snoop.jpg", "Mafalda.jpg"];
    let currentPage = 1;
    function showPage(pageNumber) {
        currentPage = Math.max(1, Math.min(pageImages.length, pageNumber));
        comicPage.src = pageImages[currentPage - 1];
        comicPage.alt = `Página ${currentPage} do quadrinho`;
        currentPageLabel.textContent = String(currentPage);
    }

    function closeMenus() {
        topMenu.classList.remove("is-open");
        menuTrigger.setAttribute("aria-expanded", "false");
        resizeMenu.classList.remove("is-open");
        resizeTrigger.setAttribute("aria-expanded", "false");
    }

    function setFitMode(mode) {
        reader.classList.remove("fit-standard", "fit-width", "fit-height", "fit-screen");
        if (mode !== "standard") {
            reader.classList.add(`fit-${mode}`);
        }

        document.querySelectorAll("[data-fit]").forEach((button) => {
            button.setAttribute("aria-checked", String(button.dataset.fit === mode));
        });
    }

    menuTrigger.addEventListener("click", () => {
        const isOpen = topMenu.classList.toggle("is-open");
        menuTrigger.setAttribute("aria-expanded", String(isOpen));
        resizeMenu.classList.remove("is-open");
        resizeTrigger.setAttribute("aria-expanded", "false");
    });

    resizeTrigger.addEventListener("click", () => {
        const isOpen = resizeMenu.classList.toggle("is-open");
        resizeTrigger.setAttribute("aria-expanded", String(isOpen));
        topMenu.classList.remove("is-open");
        menuTrigger.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll("[data-fit]").forEach((button) => {
        button.addEventListener("click", () => {
            setFitMode(button.dataset.fit);
            closeMenus();
        });
    });

    document.addEventListener("click", (event) => {
        if (!topMenu.contains(event.target) && !resizeMenu.contains(event.target)) {
            closeMenus();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenus();
            return;
        }

        if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) {
            return;
        }

        if (event.key === "ArrowRight") showPage(currentPage + 1);
        if (event.key === "ArrowLeft") showPage(currentPage - 1);
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            reader.classList.toggle("is-hidden");
        }
    });

    pageArea.addEventListener("click", (event) => {
        const position = event.clientX / window.innerWidth;
        if (position < 0.32) {
            showPage(currentPage - 1);
        } else if (position > 0.68) {
            showPage(currentPage + 1);
        } else {
            reader.classList.toggle("is-hidden");
            closeMenus();
        }
    });

})();
