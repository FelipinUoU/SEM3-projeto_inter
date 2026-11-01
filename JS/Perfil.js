import { account } from "./JAVA/appwriteClient.js";

const defaultAvatar = "../Img/Perfil/PerfilExemplo.svg";
const maxAvatarSize = 1.5 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const editMode = document.getElementById("editMode");
const profileImage = document.querySelector(".profile-avatar--large");
const profileInputs = document.querySelectorAll(".profile-view-fields input");
const editInputs = document.querySelectorAll(".profile-edit-fields input");
const profileFeedback = document.getElementById("profileFeedback");
const loginLink = document.getElementById("profileLoginLink");
const photoInput = document.getElementById("profilePhotoInput");
const removePhotoButton = document.querySelector(".photo-remove");
const saveButton = document.querySelector(".profile-save-button");
let user;
let avatarKey;
let savedAvatar = defaultAvatar;
let pendingAvatar = defaultAvatar;
let photoChanged = false;

editMode.disabled = true;
saveButton.disabled = true;

function showFeedback(message, isError = false) {
    profileFeedback.textContent = message;
    profileFeedback.classList.toggle("is-error", isError);
}

function setProfileFields(profile) {
    profileInputs[0].value = profile.name || "";
    profileInputs[1].value = profile.email || "";
    editInputs[0].value = profile.name || "";
}

function resetPendingChanges() {
    setProfileFields(user);
    editInputs[1].value = "";
    editInputs[2].value = "";
    editInputs[3].value = "";
    editInputs[4].value = "";
    photoInput.value = "";
    pendingAvatar = savedAvatar;
    photoChanged = false;
    profileImage.src = savedAvatar;
    showFeedback("");
}

async function loadProfile() {
    try {
        user = await account.get();
        avatarKey = `hokupedia.profileAvatar.${user.$id}`;
        setProfileFields(user);
        editMode.disabled = false;
        saveButton.disabled = false;

        try {
            const storedAvatar = localStorage.getItem(avatarKey);
            if (storedAvatar !== null) {
                if (!/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/.test(storedAvatar)) {
                    throw new Error("A foto de perfil salva está em um formato inválido.");
                }
                savedAvatar = storedAvatar;
            }
        } catch (error) {
            console.error("Não foi possível carregar a foto do perfil:", error);
            showFeedback("Não foi possível carregar a foto salva. A imagem padrão será usada.", true);
        }

        pendingAvatar = savedAvatar;
        profileImage.src = savedAvatar;
        if (profileFeedback.textContent.startsWith("Carregando")) showFeedback("");
    } catch (error) {
        if (error.code === 401) {
            showFeedback("Faça login para visualizar e editar seu perfil.", true);
            loginLink.hidden = false;
            return;
        }
        console.error("Não foi possível carregar os dados do perfil:", error);
        showFeedback(error.message || "Não foi possível carregar os dados do perfil.", true);
    }
}

function readAvatar(file) {
    if (!allowedAvatarTypes.has(file.type)) {
        showFeedback("Escolha uma imagem JPEG, PNG, WebP, GIF ou AVIF.", true);
        photoInput.value = "";
        return;
    }
    if (file.size > maxAvatarSize) {
        showFeedback("A foto deve ter no máximo 1,5 MB.", true);
        photoInput.value = "";
        return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") {
            showFeedback("Não foi possível ler a imagem selecionada.", true);
            return;
        }
        pendingAvatar = reader.result;
        photoChanged = true;
        profileImage.src = pendingAvatar;
        showFeedback("Foto selecionada. Salve as alterações para confirmar.");
    });
    reader.addEventListener("error", () => {
        showFeedback("Não foi possível ler a imagem selecionada.", true);
    });
    reader.readAsDataURL(file);
}

async function saveProfile() {
    if (!user) return;

    const name = editInputs[0].value.trim();
    const email = editInputs[1].value.trim();
    const currentPassword = editInputs[2].value;
    const newPassword = editInputs[3].value;
    const confirmPassword = editInputs[4].value;
    const changesEmail = email !== "" && email.toLowerCase() !== user.email.toLowerCase();
    const changesPassword = newPassword !== "" || confirmPassword !== "";

    if (!name) {
        showFeedback("Digite seu nome.", true);
        editInputs[0].focus();
        return;
    }
    if (changesPassword && newPassword.length < 8) {
        showFeedback("A nova senha deve ter pelo menos 8 caracteres.", true);
        editInputs[3].focus();
        return;
    }
    if (changesPassword && newPassword.length > 256) {
        showFeedback("A nova senha deve ter no máximo 256 caracteres.", true);
        editInputs[3].focus();
        return;
    }
    if (changesPassword && newPassword !== confirmPassword) {
        showFeedback("As novas senhas não são iguais.", true);
        editInputs[4].focus();
        return;
    }
    if (changesEmail && !editInputs[1].checkValidity()) {
        showFeedback("Digite um e-mail válido.", true);
        editInputs[1].focus();
        return;
    }
    if ((changesEmail || changesPassword) && !currentPassword) {
        showFeedback("Informe sua senha atual para alterar o e-mail ou a senha.", true);
        editInputs[2].focus();
        return;
    }

    saveButton.disabled = true;
    showFeedback("Salvando alterações...");

    try {
        if (name !== user.name) user = await account.updateName({ name });
        if (changesEmail) user = await account.updateEmail({ email, password: currentPassword });
        if (changesPassword) user = await account.updatePassword({ password: newPassword, oldPassword: currentPassword });

        if (photoChanged) {
            if (pendingAvatar === defaultAvatar) {
                localStorage.removeItem(avatarKey);
            } else {
                localStorage.setItem(avatarKey, pendingAvatar);
            }
            savedAvatar = pendingAvatar;
            photoChanged = false;
        }

        setProfileFields(user);
        editMode.checked = false;
        resetPendingChanges();
        showFeedback(changesEmail
            ? "Perfil atualizado. O novo e-mail precisa ser confirmado novamente."
            : "Perfil atualizado com sucesso.");
    } catch (error) {
        console.error("Não foi possível salvar as alterações do perfil:", error);
        try {
            user = await account.get();
            setProfileFields(user);
        } catch (refreshError) {
            console.error("Não foi possível atualizar os dados do perfil após a falha:", refreshError);
        }
        showFeedback(error.message || "Não foi possível salvar as alterações do perfil.", true);
    } finally {
        saveButton.disabled = false;
    }
}

editMode.addEventListener("change", () => {
    if (editMode.checked) {
        setProfileFields(user);
        showFeedback("");
    } else if (user) {
        resetPendingChanges();
    }
});

photoInput.addEventListener("change", () => {
    const [file] = photoInput.files;
    if (file) readAvatar(file);
});

removePhotoButton.addEventListener("click", () => {
    pendingAvatar = defaultAvatar;
    photoChanged = true;
    photoInput.value = "";
    profileImage.src = defaultAvatar;
    showFeedback("A foto padrão será restaurada ao salvar.");
});

saveButton.addEventListener("click", saveProfile);
loadProfile();