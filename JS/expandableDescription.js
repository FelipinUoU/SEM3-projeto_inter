const descriptions = new Set();
const descriptionsByElement = new WeakMap();
let nextDescriptionId = 1;

function measureDescription(description) {
    const { element, button } = description;
    if (descriptionsByElement.get(element) !== description) return;
    if (!element.isConnected) {
        descriptions.delete(description);
        descriptionsByElement.delete(element);
        return;
    }

    const isExpanded = button.getAttribute("aria-expanded") === "true";
    element.classList.add("is-collapsed");
    const canExpand = element.scrollHeight > element.clientHeight + 1;
    button.hidden = !canExpand;

    if (!canExpand) {
        element.classList.remove("is-collapsed");
        button.setAttribute("aria-expanded", "false");
        button.textContent = "Mostrar mais";
    } else if (isExpanded) {
        element.classList.remove("is-collapsed");
    }
}

function measureDescriptions() {
    descriptions.forEach(measureDescription);
}

window.addEventListener("resize", measureDescriptions);

export function setExpandableDescription(element, text) {
    const previousDescription = descriptionsByElement.get(element);
    if (previousDescription) {
        descriptions.delete(previousDescription);
    }

    element.textContent = text;
    element.classList.add("is-collapsed");

    const previousButton = element.nextElementSibling;
    if (previousButton?.classList.contains("description-toggle")) {
        previousButton.remove();
    }

    const button = document.createElement("button");
    button.className = "description-toggle";
    button.type = "button";
    button.textContent = "Mostrar mais";
    button.setAttribute("aria-expanded", "false");
    const descriptionId = nextDescriptionId++;
    button.id = `description-toggle-${descriptionId}`;
    element.id ||= `description-${descriptionId}`;
    button.setAttribute("aria-controls", element.id);
    button.addEventListener("click", () => {
        const isExpanded = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(isExpanded));
        button.textContent = isExpanded ? "Mostrar menos" : "Mostrar mais";
        element.classList.toggle("is-collapsed", !isExpanded);
    });

    element.insertAdjacentElement("afterend", button);
    const description = { element, button };
    descriptions.add(description);
    descriptionsByElement.set(element, description);
    requestAnimationFrame(() => measureDescription(description));
}
