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

document.querySelectorAll(".categorias [data-href]").forEach((item) => {
    item.addEventListener("click", () => {
        window.location.href = item.dataset.href;
    });
});

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
