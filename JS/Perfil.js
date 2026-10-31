import { account } from "./JAVA/appwriteClient.js";
import { loadProfileUser, renderProfileAvatar } from "./PerfilAvatar.js";

const fallbackAvatar = new URL("/Img/PerfilExemplo.svg", window.location.origin).href;
const editMode = document.getElementById("editMode");
const editForm = document.getElementById("profileEditForm");
const feedback = document.getElementById("profileFeedback");
const saveButton = document.querySelector(".profile-save-button");
const photoInput = document.getElementById("profilePhotoInput");
const removePhotoButton = document.getElementById("removePhotoButton");
const photoImage = document.querySelector(".profile-photo > img");
const nameField = document.getElementById("editName");
const currentEmailField = document.getElementById("currentEmail");
const newEmailField = document.getElementById("newEmail");
const currentPasswordField = document.getElementById("currentPassword");
const newPasswordField = document.getElementById("newPassword");
const confirmPasswordField = document.getElementById("confirmNewPassword");
const supportedImageTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;
let currentUser;
let originalAvatarFileId = null;
let selectedAvatarFile = null;
let removeAvatar = false;
let previewUrl = null;

editMode.disabled = true;

function showFeedback(message, type = "") {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", type === "error");
    feedback.classList.toggle("is-success", type === "success");
}

function getAvatarUrl(user) {
    return typeof user.prefs?.profileAvatarUrl === "string"
        ? user.prefs.profileAvatarUrl
        : fallbackAvatar;
}

function renderUser(user) {
    currentUser = user;
    originalAvatarFileId = typeof user.prefs?.profileAvatarFileId === "string"
        ? user.prefs.profileAvatarFileId
        : null;
    document.getElementById("profileName").value = user.name || "";
    document.getElementById("profileEmail").value = user.email || "";
    renderProfileAvatar(user);
}

function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedAvatarFile = null;
    photoInput.value = "";
    removeAvatar = false;
    photoImage.src = getAvatarUrl(currentUser);
}

function apiRequest(url, options = {}) {
    return account.createJWT().then(({ jwt }) => fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            "X-Appwrite-JWT": jwt
        }
    })).then(async (response) => {
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await response.json() : {};
        if (!response.ok) throw new Error(data.error || `A solicitação falhou (HTTP ${response.status}).`);
        return data;
    });
}

async function uploadAvatar(file) {
    return apiRequest(`/api/profile/avatar?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file
    });
}

async function deleteAvatar(fileId) {
    if (!fileId) return;
    await apiRequest(`/api/profile/avatar/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

function fillEditFields() {
    nameField.value = currentUser.name || "";
    currentEmailField.value = currentUser.email || "";
    newEmailField.value = "";
    currentPasswordField.value = "";
    newPasswordField.value = "";
    confirmPasswordField.value = "";
    clearPreview();
    showFeedback("");
}

editMode.addEventListener("change", () => {
    if (editMode.checked) {
        fillEditFields();
    } else {
        clearPreview();
        showFeedback("");
    }
});

photoInput.addEventListener("change", () => {
    const [file] = photoInput.files || [];
    if (!file) return;
    if (!supportedImageTypes.has(file.type)) {
        photoInput.value = "";
        showFeedback("Selecione uma imagem AVIF, GIF, JPEG, PNG ou WebP.", "error");
        return;
    }
    if (file.size > maxAvatarBytes) {
        photoInput.value = "";
        showFeedback("A foto deve ter no máximo 5 MB.", "error");
        return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedAvatarFile = file;
    removeAvatar = false;
    previewUrl = URL.createObjectURL(file);
    photoImage.src = previewUrl;
    showFeedback("A foto será enviada ao salvar as alterações.");
});

removePhotoButton.addEventListener("click", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedAvatarFile = null;
    photoInput.value = "";
    removeAvatar = true;
    photoImage.src = fallbackAvatar;
    showFeedback("A remoção da foto será aplicada ao salvar.");
});

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const name = nameField.value.trim();
    const currentEmail = currentEmailField.value.trim();
    const newEmail = newEmailField.value.trim();
    const currentPassword = currentPasswordField.value;
    const newPassword = newPasswordField.value;
    const confirmPassword = confirmPasswordField.value;
    const emailChanged = newEmail.length > 0 && newEmail.toLowerCase() !== currentUser.email.toLowerCase();
    const passwordChanged = newPassword.length > 0;

    if (!name) {
        showFeedback("O nome não pode ficar vazio.", "error");
        nameField.focus();
        return;
    }
    if (name === currentUser.name && !emailChanged && !passwordChanged && !selectedAvatarFile && !removeAvatar) {
        editMode.checked = false;
        showFeedback("Nenhuma alteração foi feita.");
        return;
    }
    if (emailChanged && currentEmail.toLowerCase() !== currentUser.email.toLowerCase()) {
        showFeedback("Informe o e-mail atual da conta antes de alterá-lo.", "error");
        currentEmailField.focus();
        return;
    }
    if ((emailChanged || passwordChanged) && !currentPassword) {
        showFeedback("Informe sua senha atual para alterar o e-mail ou a senha.", "error");
        currentPasswordField.focus();
        return;
    }
    if (passwordChanged && (newPassword.length < 8 || newPassword.length > 256)) {
        showFeedback("A nova senha deve ter entre 8 e 256 caracteres.", "error");
        newPasswordField.focus();
        return;
    }
    if (passwordChanged && newPassword !== confirmPassword) {
        showFeedback("As novas senhas não são iguais.", "error");
        confirmPasswordField.focus();
        return;
    }

    saveButton.disabled = true;
    let uploadedAvatar = null;
    let avatarSaved = false;
    let avatarPersistenceAttempted = false;
    const previousAvatarFileId = originalAvatarFileId;
    showFeedback("Salvando alterações...");

    try {
        if (selectedAvatarFile) uploadedAvatar = await uploadAvatar(selectedAvatarFile);

        if (name && name !== currentUser.name) {
            currentUser = await account.updateName({ name });
        }
        if (emailChanged) {
            currentUser = await account.updateEmail({ email: newEmail, password: currentPassword });
        }
        if (passwordChanged) {
            currentUser = await account.updatePassword({ password: newPassword, oldPassword: currentPassword });
        }

        if (uploadedAvatar || removeAvatar) {
            const prefs = { ...currentUser.prefs };
            if (uploadedAvatar) {
                prefs.profileAvatarUrl = uploadedAvatar.url;
                prefs.profileAvatarFileId = uploadedAvatar.fileId;
            } else {
                delete prefs.profileAvatarUrl;
                delete prefs.profileAvatarFileId;
            }
            avatarPersistenceAttempted = true;
            currentUser = await account.updatePrefs({ prefs });
            avatarSaved = true;
        }

        currentUser = await account.get();
        renderUser(currentUser);
        editMode.checked = false;
        editForm.reset();
        clearPreview();

        if (previousAvatarFileId && (uploadedAvatar || removeAvatar)) {
            try {
                await deleteAvatar(previousAvatarFileId);
            } catch (error) {
                console.error("Não foi possível remover a foto de perfil anterior:", error);
                showFeedback("Alterações salvas, mas não foi possível excluir a foto anterior.", "error");
                return;
            }
        }

        showFeedback(
            emailChanged
                ? "Alterações salvas. Confirme o novo e-mail para validar a conta."
                : "Alterações salvas com sucesso.",
            "success"
        );
    } catch (error) {
        console.error("Não foi possível salvar as alterações do perfil:", error);
        let profileRefreshed = false;
        try {
            currentUser = await account.get();
            renderUser(currentUser);
            fillEditFields();
            profileRefreshed = true;
            if (uploadedAvatar) {
                avatarSaved = currentUser.prefs?.profileAvatarFileId === uploadedAvatar.fileId;
            }
        } catch (refreshError) {
            console.error("Não foi possível atualizar os dados do perfil:", refreshError);
            currentPasswordField.value = "";
            newPasswordField.value = "";
            confirmPasswordField.value = "";
        }
        if (uploadedAvatar && !avatarSaved && (!avatarPersistenceAttempted || profileRefreshed)) {
            try {
                await deleteAvatar(uploadedAvatar.fileId);
            } catch (cleanupError) {
                console.error("Não foi possível remover o upload de perfil não utilizado:", cleanupError);
            }
        }
        showFeedback(error.message || "Não foi possível salvar as alterações. Tente novamente.", "error");
    } finally {
        saveButton.disabled = false;
    }
});

loadProfileUser()
    .then((user) => {
        renderUser(user);
        fillEditFields();
        clearPreview();
        editMode.disabled = false;
    })
    .catch((error) => {
        console.error("Não foi possível carregar o perfil:", error);
        showFeedback(error.code === 401
            ? "Faça login para visualizar e editar seu perfil."
            : error.message || "Não foi possível carregar seu perfil.", "error");
        editMode.disabled = true;
        saveButton.disabled = true;
    });
