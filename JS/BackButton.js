document.querySelectorAll(".back-button").forEach((button) => {
    button.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.assign("/HTML/Catalogo.html");
    });
});
