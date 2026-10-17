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
        dashboardItems.forEach((dashboardItem) => {
            dashboardItem.setAttribute("aria-pressed", String(dashboardItem === item));
        });
        selectionMessage.textContent = `Item ${item.textContent.trim()} selecionado.`;
    });
});
