import { account } from "./JAVA/appwriteClient.js";

const fallbackAvatar = new URL("/Img/PerfilExemplo.svg", window.location.origin).href;
let profileUserPromise;

export function loadProfileUser() {
    if (!profileUserPromise) profileUserPromise = account.get();
    return profileUserPromise;
}

export function renderProfileAvatar(user) {
    const avatar = typeof user.prefs?.profileAvatarUrl === "string"
        ? user.prefs.profileAvatarUrl
        : fallbackAvatar;

    document.querySelectorAll(".boxbody img, .profile-photo > img").forEach((image) => {
        image.src = avatar;
        image.alt = `Foto de perfil${user.name ? ` de ${user.name}` : ""}`;
    });
}

if (document.querySelector(".boxbody img")) {
    loadProfileUser()
        .then(renderProfileAvatar)
        .catch((error) => {
            if (error.code !== 401) console.error("Não foi possível carregar o avatar do perfil:", error);
        });
}
