import { account, ID } from "../JS/JAVA/appwriteClient.js";

const modeButtons = document.querySelectorAll("[data-auth-mode]");
const tabs = document.querySelector(".auth-tabs");
const registerPanel = document.getElementById("registerPanel");
const loginPanel = document.getElementById("loginPanel");
const registerForm = document.getElementById("formCadastro");
const loginForm = document.getElementById("formLogin");
const recoveryRequestForm = document.getElementById("formRecoveryRequest");
const passwordResetForm = document.getElementById("formPasswordReset");
const registerFeedback = document.getElementById("registerFeedback");
const loginFeedback = document.getElementById("loginFeedback");
const recoveryRequestFeedback = document.getElementById("recoveryRequestFeedback");
const passwordResetFeedback = document.getElementById("passwordResetFeedback");
let recoveryUserId = "";

function showFeedback(element, message, type = "") {
    element.textContent = message;
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
}

function setAuthMode(mode, updateUrl = true) {
    const isLogin = mode === "login";
    tabs.hidden = false;

    modeButtons.forEach((button) => {
        const isSelected = button.dataset.authMode === mode;
        button.classList.toggle("is-active", isSelected);
        button.setAttribute("aria-selected", String(isSelected));
        button.tabIndex = isSelected ? 0 : -1;
    });

    registerPanel.hidden = isLogin;
    registerPanel.inert = isLogin;
    loginPanel.hidden = !isLogin;
    loginPanel.inert = !isLogin;
    document.title = `HokuPédia - ${isLogin ? "Login" : "Cadastro"}`;

    if (updateUrl) {
        window.history.replaceState(null, "", `/HTML/CadLog.html?mode=${mode}`);
    }
}

modeButtons.forEach((button, index) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextButton = modeButtons[(index + direction + modeButtons.length) % modeButtons.length];
        nextButton.focus();
        setAuthMode(nextButton.dataset.authMode);
    });
});

const routeMode = window.location.pathname === "/Login" ? "login"
    : window.location.pathname === "/Cadastro" ? "register"
        : null;
const initialMode = new URLSearchParams(window.location.search).get("mode") === "login"
    ? "login"
    : routeMode || "register";
setAuthMode(initialMode);

document.getElementById("showRecoveryButton").addEventListener("click", () => {
    loginForm.hidden = true;
    loginForm.inert = true;
    document.getElementById("showRecoveryButton").hidden = true;
    recoveryRequestForm.hidden = false;
    recoveryRequestForm.inert = false;
    passwordResetForm.hidden = true;
    passwordResetForm.inert = true;
    document.getElementById("recoveryEmail").value = document.getElementById("loginEmail").value.trim();
    document.getElementById("recoveryEmail").focus();
});

document.getElementById("cancelRecoveryButton").addEventListener("click", () => {
    recoveryRequestForm.reset();
    recoveryRequestForm.hidden = true;
    recoveryRequestForm.inert = true;
    loginForm.hidden = false;
    loginForm.inert = false;
    document.getElementById("showRecoveryButton").hidden = false;
    showFeedback(recoveryRequestFeedback, "");
    setAuthMode("login");
    document.getElementById("showRecoveryButton").focus();
});

document.getElementById("backToLoginButton").addEventListener("click", () => {
    passwordResetForm.reset();
    passwordResetForm.hidden = true;
    passwordResetForm.inert = true;
    recoveryRequestForm.reset();
    recoveryUserId = "";
    loginForm.hidden = false;
    loginForm.inert = false;
    document.getElementById("showRecoveryButton").hidden = false;
    showFeedback(passwordResetFeedback, "");
    setAuthMode("login");
    document.getElementById("loginEmail").focus();
});

document.getElementById("resendRecoveryButton").addEventListener("click", () => {
    passwordResetForm.reset();
    passwordResetForm.hidden = true;
    passwordResetForm.inert = true;
    recoveryUserId = "";
    recoveryRequestForm.hidden = false;
    recoveryRequestForm.inert = false;
    showFeedback(passwordResetFeedback, "");
    document.getElementById("recoveryEmail").focus();
});

recoveryRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(recoveryRequestFeedback, "");

    const email = document.getElementById("recoveryEmail").value.trim();
    const submitButton = recoveryRequestForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showFeedback(recoveryRequestFeedback, "Enviando solicitação...");

    try {
        const recovery = await account.createRecoveryOTP({
            email,
            phrase: false
        });
        if (!recovery.userId) throw new Error("O Appwrite não retornou a identificação da conta para recuperação.");

        recoveryUserId = recovery.userId;
        recoveryRequestForm.hidden = true;
        recoveryRequestForm.inert = true;
        passwordResetForm.hidden = false;
        passwordResetForm.inert = false;
        showFeedback(passwordResetFeedback, "Se o e-mail estiver cadastrado, você receberá um código de 6 dígitos válido por 15 minutos.", "success");
        document.getElementById("recoveryCode").focus();
    } catch (error) {
        console.error("Erro ao solicitar recuperação de senha:", error);
        showFeedback(
            recoveryRequestFeedback,
            error.message || "Não foi possível enviar o código de recuperação. Tente novamente.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
    }
});

passwordResetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(passwordResetFeedback, "");

    const password = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;
    const code = document.getElementById("recoveryCode").value.trim();
    const submitButton = passwordResetForm.querySelector('button[type="submit"]');

    if (!/^\d{6}$/.test(code)) {
        showFeedback(passwordResetFeedback, "Digite o código de 6 dígitos recebido por e-mail.", "error");
        document.getElementById("recoveryCode").focus();
        return;
    }
    if (password.length < 8 || password.length > 256) {
        showFeedback(passwordResetFeedback, "A senha deve ter entre 8 e 256 caracteres.", "error");
        document.getElementById("newPassword").focus();
        return;
    }
    if (password !== confirmPassword) {
        showFeedback(passwordResetFeedback, "As senhas não são iguais.", "error");
        document.getElementById("confirmNewPassword").focus();
        return;
    }

    if (!recoveryUserId) {
        showFeedback(passwordResetFeedback, "Solicite um novo código de recuperação.", "error");
        return;
    }

    submitButton.disabled = true;
    showFeedback(passwordResetFeedback, "Atualizando sua senha...");
    try {
        await account.updateRecoveryOTP({
            userId: recoveryUserId,
            secret: code,
            password
        });
        passwordResetForm.reset();
        recoveryRequestForm.reset();
        recoveryUserId = "";
        passwordResetForm.hidden = true;
        passwordResetForm.inert = true;
        loginForm.hidden = false;
        loginForm.inert = false;
        document.getElementById("showRecoveryButton").hidden = false;
        setAuthMode("login");
        showFeedback(loginFeedback, "Senha redefinida. Entre com sua nova senha.", "success");
        document.getElementById("loginEmail").focus();
    } catch (error) {
        console.error("Erro ao redefinir senha:", error);
        showFeedback(
            passwordResetFeedback,
            error.message || "Não foi possível redefinir a senha. Solicite um novo link.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(registerFeedback, "");

    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const confirmEmail = document.getElementById("confirmRegisterEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmRegisterPassword").value;
    const submitButton = registerForm.querySelector('button[type="submit"]');

    if (!name) {
        showFeedback(registerFeedback, "Digite seu nome.", "error");
        document.getElementById("registerName").focus();
        return;
    }
    if (email.toLowerCase() !== confirmEmail.toLowerCase()) {
        showFeedback(registerFeedback, "Os e-mails não são iguais.", "error");
        document.getElementById("confirmRegisterEmail").focus();
        return;
    }
    if (password.length < 8 || password.length > 256) {
        showFeedback(registerFeedback, "A senha deve ter entre 8 e 256 caracteres.", "error");
        document.getElementById("registerPassword").focus();
        return;
    }
    if (password !== confirmPassword) {
        showFeedback(registerFeedback, "As senhas não são iguais.", "error");
        document.getElementById("confirmRegisterPassword").focus();
        return;
    }

    submitButton.disabled = true;
    showFeedback(registerFeedback, "Criando sua conta...");
    try {
        await account.create({
            userId: ID.unique(),
            email,
            password,
            name
        });

        registerForm.reset();
        document.getElementById("loginEmail").value = email;
        setAuthMode("login");
        showFeedback(loginFeedback, "Cadastro realizado! Agora entre com sua conta.", "success");
        document.getElementById("loginEmail").focus();
    } catch (error) {
        console.error("Erro no cadastro:", error);
        showFeedback(registerFeedback, error.message || "Não foi possível criar a conta.", "error");
    } finally {
        submitButton.disabled = false;
    }
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback(loginFeedback, "");

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const submitButton = loginForm.querySelector('button[type="submit"]');

    if (!email || !password) {
        showFeedback(loginFeedback, "Preencha o e-mail e a senha.", "error");
        return;
    }

    submitButton.disabled = true;
    showFeedback(loginFeedback, "Entrando...");
    try {
        try {
            await account.get();
            await account.deleteSession({ sessionId: "current" });
        } catch (error) {
            if (error.code !== 401) throw error;
        }

        await account.createEmailPasswordSession({ email, password });
        const destination = email.toLowerCase() === "hokupedia@gmail.com"
            ? "/HTML/GerenciarObras.html"
            : "/HTML/Biblioteca.html";
        window.location.assign(destination);
    } catch (error) {
        console.error("Erro no login:", error);
        const message = error.code === 401
            ? "E-mail ou senha incorretos."
            : error.message || "Não foi possível entrar. Tente novamente.";
        showFeedback(loginFeedback, message, "error");
        submitButton.disabled = false;
    }
});
