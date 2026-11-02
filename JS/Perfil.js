import { account } from "./JAVA/appwriteClient.js";

const defaultAvatar = "../Img/Perfil/PerfilExemplo.svg";
const maxAvatarSize = 200 * 1024;
const maxAvatarSourceSize = 10 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const profileImage = document.querySelector(".profile-avatar--large");
const profileInputs = document.querySelectorAll(".profile-view-fields input");
const editInputs = document.querySelectorAll(".profile-edit-fields input");
const profileFeedback = document.getElementById("profileFeedback");
const loginLink = document.getElementById("profileLoginLink");
const profileCard = document.querySelector(".profile-card");
const editButton = document.getElementById("profileEditButton");
const photoInput = document.getElementById("profilePhotoInput");
const removePhotoButton = document.querySelector(".photo-remove");
const saveButton = document.querySelector(".profile-save-button");
const deleteAccountButton = document.querySelector(".profile-delete-button");
const logoutButton = document.getElementById("profileLogoutButton");
const passwordConfirmDialog = document.getElementById("passwordConfirmDialog");
const passwordConfirmForm = document.getElementById("passwordConfirmForm");
const passwordConfirmInput = document.getElementById("profileConfirmPassword");
const passwordConfirmFeedback = document.getElementById("passwordConfirmFeedback");
const submitPasswordConfirm = document.getElementById("submitPasswordConfirm");
const cancelPasswordConfirm = document.getElementById("cancelPasswordConfirm");
const deleteAccountDialog = document.getElementById("accountDeleteDialog");
const deleteAccountForm = document.getElementById("accountDeleteForm");
const deleteAccountPassword = document.getElementById("accountDeletePassword");
const deleteAccountFeedback = document.getElementById("accountDeleteFeedback");
const confirmDeleteButton = document.getElementById("confirmAccountDelete");
const cancelDeleteButton = document.getElementById("cancelAccountDelete");
let user;
let avatarKey;
let savedAvatar = defaultAvatar;
let pendingAvatar = defaultAvatar;
let photoChanged = false;
let isAdmin = false;
let confirmedPassword = "";

editButton.disabled = true;
saveButton.disabled = true;
deleteAccountButton.disabled = true;
logoutButton.disabled = true;

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
    photoInput.value = "";
    pendingAvatar = savedAvatar;
    photoChanged = false;
    confirmedPassword = "";
    profileCard.classList.remove("is-editing");
    profileImage.src = savedAvatar;
    showFeedback("");
}

async function loadProfile() {
    try {
        user = await account.get();
        avatarKey = `hokupedia.profileAvatar.${user.$id}`;
        isAdmin = user.email?.trim().toLowerCase() === "hokupedia@gmail.com"
            || user.labels?.includes("admin");
        profileCard.dataset.admin = String(isAdmin);
        setProfileFields(user);
        editButton.disabled = isAdmin;
        editButton.hidden = isAdmin;
        saveButton.disabled = false;
        if (isAdmin) saveButton.textContent = "Salvar foto";
        deleteAccountButton.disabled = isAdmin;
        deleteAccountButton.hidden = isAdmin;
        logoutButton.disabled = false;
        logoutButton.hidden = false;

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

async function compressAvatar(file) {
    const image = await createImageBitmap(file);
    try {
        const canvas = document.createElement("canvas");
        const scaleToFit = Math.min(1, 512 / image.width, 512 / image.height);
        const qualities = [0.86, 0.78, 0.7, 0.62, 0.54];

        for (let scale = scaleToFit; scale >= 0.1; scale *= 0.8) {
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Não foi possível preparar a imagem para compressão.");
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            for (const quality of qualities) {
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((result) => {
                        if (result) resolve(result);
                        else reject(new Error("Não foi possível comprimir a imagem."));
                    }, "image/webp", quality);
                });
                if (blob.size <= maxAvatarSize) return blob;
            }
        }
    } finally {
        image.close();
    }

    throw new Error("Não foi possível reduzir a foto para menos de 200 KB.");
}

async function readAvatar(file) {
    if (!allowedAvatarTypes.has(file.type)) {
        showFeedback("Escolha uma imagem JPEG, PNG, WebP, GIF ou AVIF.", true);
        photoInput.value = "";
        return;
    }
    if (file.size > maxAvatarSourceSize) {
        showFeedback("A imagem original deve ter no máximo 10 MB para ser comprimida.", true);
        photoInput.value = "";
        return;
    }

    let avatarFile = file;
    if (file.size > maxAvatarSize) {
        showFeedback("Comprimindo a foto para até 200 KB...");
        try {
            avatarFile = await compressAvatar(file);
        } catch (error) {
            console.error("Não foi possível comprimir a foto de perfil:", error);
            showFeedback(error.message || "Não foi possível comprimir a imagem selecionada.", true);
            photoInput.value = "";
            return;
        }
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
    reader.readAsDataURL(avatarFile);
}

async function saveProfile() {
    if (!user) return;

    if (isAdmin) {
        if (!photoChanged) {
            showFeedback("Selecione uma foto para salvar.", true);
            return;
        }
        saveButton.disabled = true;
        try {
            if (pendingAvatar === defaultAvatar) {
                localStorage.removeItem(avatarKey);
            } else {
                localStorage.setItem(avatarKey, pendingAvatar);
            }
            savedAvatar = pendingAvatar;
            photoChanged = false;
            photoInput.value = "";
            showFeedback("Foto de perfil atualizada.");
        } catch (error) {
            console.error("Não foi possível salvar a foto do perfil:", error);
            showFeedback("Não foi possível salvar a foto do perfil. Tente novamente.", true);
        } finally {
            saveButton.disabled = false;
        }
        return;
    }

    if (!profileCard.classList.contains("is-editing") || !confirmedPassword) {
        showFeedback("Confirme sua senha antes de editar o perfil.", true);
        return;
    }

    const name = editInputs[0].value.trim();
    const email = editInputs[1].value.trim();
    const newPassword = editInputs[2].value;
    const confirmPassword = editInputs[3].value;
    const changesEmail = email !== "" && email.toLowerCase() !== user.email.toLowerCase();
    const changesPassword = newPassword !== "" || confirmPassword !== "";

    if (!name) {
        showFeedback("Digite seu nome.", true);
        editInputs[0].focus();
        return;
    }
    if (changesPassword && newPassword.length < 8) {
        showFeedback("A nova senha deve ter pelo menos 8 caracteres.", true);
        editInputs[2].focus();
        return;
    }
    if (changesPassword && newPassword.length > 256) {
        showFeedback("A nova senha deve ter no máximo 256 caracteres.", true);
        editInputs[2].focus();
        return;
    }
    if (changesPassword && newPassword !== confirmPassword) {
        showFeedback("As novas senhas não são iguais.", true);
        editInputs[3].focus();
        return;
    }
    if (changesEmail && !editInputs[1].checkValidity()) {
        showFeedback("Digite um e-mail válido.", true);
        editInputs[1].focus();
        return;
    }
    saveButton.disabled = true;
    showFeedback("Salvando alterações...");

    try {
        if (name !== user.name) user = await account.updateName({ name });
        if (changesEmail) user = await account.updateEmail({ email, password: confirmedPassword });
        if (changesPassword) {
            user = await account.updatePassword({ password: newPassword, oldPassword: confirmedPassword });
            confirmedPassword = newPassword;
        }

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
        setProfileFields(user);
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

editButton.addEventListener("click", () => {
    if (!user || isAdmin) return;
    if (profileCard.classList.contains("is-editing")) {
        resetPendingChanges();
        return;
    }
    passwordConfirmInput.value = "";
    passwordConfirmFeedback.textContent = "";
    passwordConfirmFeedback.classList.remove("is-success");
    passwordConfirmDialog.showModal();
    passwordConfirmInput.focus();
});

cancelPasswordConfirm.addEventListener("click", () => passwordConfirmDialog.close());
passwordConfirmDialog.addEventListener("close", () => {
    passwordConfirmForm.reset();
    passwordConfirmFeedback.textContent = "";
});

passwordConfirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user || isAdmin) return;

    const password = passwordConfirmInput.value;
    submitPasswordConfirm.disabled = true;
    passwordConfirmFeedback.textContent = "Verificando senha...";
    passwordConfirmFeedback.classList.remove("is-success");

    try {
        const jwt = await account.createJWT();
        const response = await fetch("/api/account/verify-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Appwrite-JWT": jwt.jwt
            },
            body: JSON.stringify({ password })
        });
        const result = await response.json();
        if (!response.ok || result.verified !== true) {
            throw new Error(result.error || "Não foi possível confirmar sua senha.");
        }

        confirmedPassword = password;
        setProfileFields(user);
        profileCard.classList.add("is-editing");
        showFeedback("");
        passwordConfirmDialog.close();
        editButton.focus();
    } catch (error) {
        console.error("Não foi possível confirmar a senha do perfil:", error);
        passwordConfirmFeedback.textContent = error.message || "Não foi possível confirmar sua senha. Tente novamente.";
        passwordConfirmInput.focus();
    } finally {
        submitPasswordConfirm.disabled = false;
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

logoutButton.addEventListener("click", async () => {
    if (!user) return;
    logoutButton.disabled = true;
    showFeedback("Saindo da conta...");
    try {
        await account.deleteSession({ sessionId: "current" });
        window.location.assign("/HTML/CadLog.html?mode=login");
    } catch (error) {
        console.error("Não foi possível encerrar a sessão:", error);
        showFeedback(error.message || "Não foi possível sair da conta. Tente novamente.", true);
        logoutButton.disabled = false;
    }
});

deleteAccountButton.addEventListener("click", () => {
    if (!user || isAdmin) return;
    deleteAccountFeedback.textContent = "";
    deleteAccountPassword.value = "";
    deleteAccountDialog.showModal();
    deleteAccountPassword.focus();
});

cancelDeleteButton.addEventListener("click", () => deleteAccountDialog.close());
deleteAccountDialog.addEventListener("close", () => {
    deleteAccountPassword.value = "";
    deleteAccountFeedback.textContent = "";
});

deleteAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!user) return;

    confirmDeleteButton.disabled = true;
    cancelDeleteButton.disabled = true;
    deleteAccountFeedback.textContent = "Verificando senha e excluindo a conta...";

    try {
        const jwt = await account.createJWT();
        const response = await fetch("/api/account", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "X-Appwrite-JWT": jwt.jwt
            },
            body: JSON.stringify({ password: deleteAccountPassword.value })
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(response.status === 401
                ? "A senha informada está incorreta. Confira e tente novamente."
                : result.error || "Não foi possível excluir sua conta.");
        }

        try {
            localStorage.removeItem(avatarKey);
        } catch (error) {
            console.error("Não foi possível remover a foto local após excluir a conta:", error);
        }
        document.getElementById("accountDeleteTitle").textContent = "Conta excluída com sucesso";
        deleteAccountDialog.querySelector(".account-delete-form > p").textContent =
            "Sua conta foi excluída. Você será redirecionado para a página inicial.";
        deleteAccountPassword.hidden = true;
        deleteAccountForm.querySelector('label[for="accountDeletePassword"]').hidden = true;
        deleteAccountForm.querySelector(".account-delete-actions").hidden = true;
        deleteAccountFeedback.textContent = "Conta excluída com sucesso.";
        deleteAccountFeedback.classList.add("is-success");
        window.setTimeout(() => window.location.assign("/"), 2000);
    } catch (error) {
        console.error("Não foi possível excluir a conta:", error);
        deleteAccountFeedback.textContent = error.message || "Não foi possível excluir sua conta. Tente novamente.";
        deleteAccountFeedback.classList.remove("is-success");
        confirmDeleteButton.disabled = false;
        cancelDeleteButton.disabled = false;
        deleteAccountPassword.focus();
    }
});

loadProfile();