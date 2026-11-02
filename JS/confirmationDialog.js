export function confirmInPage({
    title,
    message,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    destructive = false
}) {
    let dialog = document.querySelector("#confirmationDialog");
    if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "confirmationDialog";
        dialog.className = "confirmation-dialog";

        const heading = document.createElement("h2");
        heading.id = "confirmationDialogTitle";
        const description = document.createElement("p");
        description.id = "confirmationDialogMessage";
        const actions = document.createElement("div");
        actions.className = "confirmation-dialog-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.dataset.confirmCancel = "";
        cancelButton.className = "confirmation-dialog-cancel";
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.dataset.confirmAccept = "";
        actions.append(cancelButton, confirmButton);
        dialog.append(heading, description, actions);
        dialog.setAttribute("aria-labelledby", heading.id);
        dialog.setAttribute("aria-describedby", description.id);
        document.body.append(dialog);
    }

    const heading = dialog.querySelector("#confirmationDialogTitle");
    const description = dialog.querySelector("#confirmationDialogMessage");
    const cancelButton = dialog.querySelector("[data-confirm-cancel]");
    const confirmButton = dialog.querySelector("[data-confirm-accept]");
    heading.textContent = title;
    description.textContent = message;
    cancelButton.textContent = cancelLabel;
    confirmButton.textContent = confirmLabel;
    confirmButton.classList.toggle("is-destructive", destructive);

    return new Promise((resolve) => {
        const finish = (accepted) => {
            dialog.removeEventListener("close", onClose);
            dialog.removeEventListener("click", onDialogClick);
            cancelButton.removeEventListener("click", onCancel);
            confirmButton.removeEventListener("click", onConfirm);
            resolve(accepted);
        };
        const onClose = () => finish(dialog.returnValue === "confirm");
        const onDialogClick = (event) => {
            if (event.target === dialog) dialog.close("cancel");
        };
        const onCancel = () => dialog.close("cancel");
        const onConfirm = () => dialog.close("confirm");

        dialog.addEventListener("close", onClose);
        dialog.addEventListener("click", onDialogClick);
        cancelButton.addEventListener("click", onCancel);
        confirmButton.addEventListener("click", onConfirm);
        dialog.showModal();
        cancelButton.focus();
    });
}
