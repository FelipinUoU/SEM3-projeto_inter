import { account } from "../JS/JAVA/appwriteClient.js";

const formLogin = document.getElementById("formLogin");
const feedback = document.getElementById("loginFeedback");
const submitButton = formLogin?.querySelector('button[type="submit"]');

function showLoginFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

formLogin?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;

    if (email === "" || senha === "") {
        showLoginFeedback("Preencha todos os campos.", true);
        return;
    }

    submitButton.disabled = true;
    showLoginFeedback("Entrando...");
    try {
        try {
            await account.get();
            await account.deleteSession({ sessionId: "current" });
        } catch (error) {
            if (error.code !== 401) throw error;
        }

        await account.createEmailPasswordSession({ email, password: senha });
        window.location.assign("/HTML/Biblioteca.html");
    } catch (err) {
        console.error(err);
        const message = err.code === 401
            ? "E-mail ou senha incorretos."
            : err.message || "Não foi possível entrar. Tente novamente.";
        showLoginFeedback(`Falha no login: ${message}`, true);
        submitButton.disabled = false;
    }

});