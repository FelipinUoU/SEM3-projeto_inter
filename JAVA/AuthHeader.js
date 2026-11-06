import { account } from "../JS/JAVA/authClient.js";

const defaultAvatar = "/Img/Perfil/PerfilExemplo.svg";

function createAccountMenu(user, avatarSource) {
    const menu = document.createElement("div");
    menu.className = "account-menu";

    const trigger = document.createElement("button");
    trigger.className = "header-profile account-menu__trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", `Abrir menu da conta de ${user.name}`);
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "accountPopover");

    const triggerAvatar = document.createElement("img");
    triggerAvatar.className = "profile-avatar";
    triggerAvatar.src = avatarSource;
    triggerAvatar.alt = "";
    trigger.append(triggerAvatar);

    const popover = document.createElement("div");
    popover.className = "account-popover";
    popover.id = "accountPopover";
    popover.hidden = true;
    popover.setAttribute("aria-label", "Menu da conta");

    const identity = document.createElement("div");
    identity.className = "account-popover__identity";

    const identityAvatar = document.createElement("img");
    identityAvatar.className = "account-popover__avatar";
    identityAvatar.src = avatarSource;
    identityAvatar.alt = "";

    const userDetails = document.createElement("div");
    userDetails.className = "account-popover__details";

    const name = document.createElement("strong");
    name.className = "account-popover__name";
    name.textContent = user.name;

    const email = document.createElement("span");
    email.className = "account-popover__email";
    email.textContent = user.email;

    const closeButton = document.createElement("button");
    closeButton.className = "account-popover__close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Fechar menu da conta");
    closeButton.innerHTML = '<span aria-hidden="true">⌃</span>';

    userDetails.append(name, email);
    identity.append(identityAvatar, userDetails, closeButton);

    const editLink = document.createElement("a");
    editLink.className = "account-popover__action";
    editLink.href = "/HTML/Perfil.html";
    editLink.innerHTML = '<span class="account-popover__icon" aria-hidden="true">✎</span><span>Editar dados</span>';

    const logoutButton = document.createElement("button");
    logoutButton.className = "account-popover__action";
    logoutButton.type = "button";
    logoutButton.innerHTML = '<span class="account-popover__icon" aria-hidden="true">↪</span><span>Sair</span>';

    const feedback = document.createElement("p");
    feedback.className = "account-popover__feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");

    popover.append(identity, editLink, logoutButton, feedback);
    menu.append(trigger, popover);

    function setOpen(isOpen) {
        popover.hidden = !isOpen;
        trigger.setAttribute("aria-expanded", String(isOpen));
    }

    trigger.addEventListener("click", () => {
        setOpen(popover.hidden);
    });
    closeButton.addEventListener("click", () => {
        setOpen(false);
        trigger.focus();
    });
    editLink.addEventListener("click", () => setOpen(false));
    document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !popover.hidden) {
            setOpen(false);
            trigger.focus();
        }
    });
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        feedback.textContent = "Saindo...";
        feedback.classList.remove("is-error");

        try {
            await account.deleteSession({ sessionId: "current" });
            window.location.assign("/");
        } catch (error) {
            console.error("Não foi possível encerrar a sessão:", error);
            feedback.textContent = error.message || "Não foi possível sair da conta. Tente novamente.";
            feedback.classList.add("is-error");
            logoutButton.disabled = false;
        }
    });

    return menu;
}

async function updateAuthHeader() {
    const sidebarLoginLinks = document.querySelectorAll('.menu-lateral-item[href*="CadLog.html"]');
    sidebarLoginLinks.forEach((link) => link.remove());

    try {
        const user = await account.get();
        const loginButton = document.querySelector(".header-login");
        const avatarSource = typeof user.prefs?.profileAvatarUrl === "string"
            && user.prefs.profileAvatarUrl.startsWith("https://")
            ? user.prefs.profileAvatarUrl
            : defaultAvatar;

        if (loginButton) {
            loginButton.replaceWith(createAccountMenu(user, avatarSource));
        }

        window.addEventListener("profile-avatar-updated", (event) => {
            const source = typeof event.detail?.url === "string" && event.detail.url
                ? event.detail.url
                : defaultAvatar;
            document.querySelectorAll(".header-profile .profile-avatar, .account-popover__avatar")
                .forEach((image) => { image.src = source; });
        });
    } catch (error) {
        if (error.code !== 401) {
            console.error("Não foi possível verificar a sessão para atualizar o cabeçalho:", error);
        }
    }
}

updateAuthHeader();