import { account } from "./JAVA/authClient.js";
import { confirmInPage } from "./confirmationDialog.js";

const feedback = document.querySelector("#feedback");
const sections = {
    moderation: document.querySelector("#moderationRequests"),
    work: document.querySelector("#workRequests")
};
const coverPreviewDialog = document.querySelector("#coverPreviewDialog");
const coverPreviewImage = document.querySelector("#coverPreviewImage");
const adminEmail = "hokupedia@gmail.com";

async function apiRequest(url, options = {}) {
    const headers = new Headers(options.headers);
    if (options.body) {
        headers.set("Content-Type", "application/json");
        options.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) throw new Error(data.error || `A solicitação falhou (HTTP ${response.status}).`);
    if (!contentType.includes("application/json")) {
        throw new Error(`Resposta inesperada do servidor (HTTP ${response.status}).`);
    }
    return data;
}

function showFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
}

function createRequester(name) {
    const requester = document.createElement("span");
    requester.className = "requester";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("cx", "12");
    head.setAttribute("cy", "8");
    head.setAttribute("r", "4");
    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.setAttribute("d", "M4 21a8 8 0 0 1 16 0");
    icon.append(head, body);
    const label = document.createElement("span");
    label.textContent = name || "Usuário";
    requester.append(icon, label);
    return requester;
}

function createDataLine(label, value) {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(value || "Não informado"));
    return paragraph;
}

function createWorkField(label, value) {
    const field = document.createElement("div");
    field.className = "work-approval-field";
    const heading = document.createElement("span");
    heading.className = "work-approval-label";
    heading.textContent = label;
    const content = document.createElement("div");
    content.className = "work-approval-value";
    content.textContent = value || "Não informado";
    field.append(heading, content);
    return field;
}

function createGenreTags(value) {
    const field = document.createElement("div");
    field.className = "work-approval-field work-approval-genres";
    const heading = document.createElement("span");
    heading.className = "work-approval-label";
    heading.textContent = "Categorias";
    const tags = document.createElement("div");
    tags.className = "work-approval-tags";
    const genres = String(value || "")
        .split(/[,;\n]/)
        .map((genre) => genre.trim())
        .filter(Boolean);

    for (const genre of genres.length ? genres : ["Não informado"]) {
        const tag = document.createElement("span");
        tag.className = "work-approval-tag";
        if (genre !== "Não informado") {
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("aria-hidden", "true");
            const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
            check.setAttribute("d", "m5 12 4 4L19 6");
            icon.append(check);
            tag.append(icon);
        }
        tag.append(document.createTextNode(genre));
        tags.append(tag);
    }

    field.append(heading, tags);
    return field;
}

function createApprovalButton(label, decision) {
    const button = document.createElement("button");
    button.className = `approval-action ${decision === "aprovar" ? "approve-action" : "reject-action"}`;
    button.type = "button";
    button.dataset.decision = decision;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", decision === "aprovar" ? "m4 12 5 5L20 6" : "m6 6 12 12M18 6 6 18");
    icon.append(path);
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    return button;
}

function createCard(title, userName, kind, request) {
    const card = document.createElement("details");
    card.className = "approval-card";
    card.dataset.kind = kind;
    card.dataset.requestId = request.id;

    const summary = document.createElement("summary");
    summary.className = "approval-card-summary";
    const header = document.createElement("header");
    header.className = "approval-card-header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const toggle = document.createElement("span");
    toggle.className = "approval-card-toggle";
    toggle.textContent = "Ver detalhes";
    header.append(heading, createRequester(userName), toggle);
    summary.append(header);

    const details = document.createElement("div");
    details.className = `approval-details${kind === "work" ? " approval-details-work" : ""}`;
    details.append(createRequestDetails(kind, request));

    const actions = document.createElement("div");
    actions.className = "approval-actions";
    actions.append(
        createApprovalButton("Reprovar", "reprovar"),
        createApprovalButton("Aprovar", "aprovar")
    );
    details.append(actions);
    card.append(summary, details);
    return card;
}

function createRequestDetails(kind, request) {
    const data = document.createElement("div");
    data.className = "request-data";

    if (kind === "moderation") {
        data.append(createDataLine("Usuário", request.userName));
        data.append(
            createDataLine("Idioma preferido", request.language),
            createDataLine("Motivação", request.motivation)
        );
    } else if (kind === "work") {
        data.classList.add("work-request-data");
        const coverRegion = document.createElement("div");
        coverRegion.className = "work-approval-cover";
        if (request.cover) {
            const preview = document.createElement("button");
            preview.className = "work-request-cover-preview";
            preview.type = "button";
            preview.dataset.previewUrl = request.cover;
            preview.setAttribute("aria-label", `Ampliar capa proposta para ${request.title}`);
            const cover = document.createElement("img");
            cover.className = "work-approval-cover-image";
            cover.src = request.cover;
            cover.alt = `Capa proposta para ${request.title}`;
            preview.append(cover);
            coverRegion.append(preview);
        } else {
            const placeholder = document.createElement("span");
            placeholder.textContent = "Capa não enviada";
            coverRegion.append(placeholder);
        }
        const fields = document.createElement("div");
        fields.className = "work-approval-fields";
        const format = ({
            hq: "HQs",
            manhwa: "Manhwas",
            manga: "Mangás"
        })[request.formato] || request.formato;
        const formatAndAuthor = document.createElement("div");
        formatAndAuthor.className = "work-approval-field-row";
        formatAndAuthor.append(
            createWorkField("Autor", request.author),
            createWorkField("Formato", format)
        );
        fields.append(
            createWorkField("Nome da Obra", request.title),
            formatAndAuthor,
            createGenreTags(request.gender)
        );
        data.append(coverRegion, fields, createWorkField("Sinopse", request.synopsis));
    }
    return data;
}

function renderList(container, requests, kind, titleFor) {
    container.replaceChildren();
    if (requests.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-approvals";
        empty.textContent = "Não há pedidos pendentes nesta categoria.";
        container.append(empty);
        return;
    }
    for (const request of requests) {
        container.append(createCard(titleFor(request), request.userName, kind, request));
    }
}

async function loadRequests() {
    const data = await apiRequest("/api/homologacao");
    if (!Array.isArray(data.moderationRequests)
        || !Array.isArray(data.workRequests)) {
        throw new Error("A resposta do servidor não contém as listas de homologação esperadas.");
    }
    renderList(sections.moderation, data.moderationRequests, "moderation", () => "Pedido de Moderação");
    renderList(sections.work, data.workRequests, "work", (request) => request.title || "Adição de Obra");
}

function login() {
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.replace(`/HTML/CadLog.html?mode=login&redirect=${redirect}`);
}

document.addEventListener("click", async (event) => {
    const coverPreview = event.target.closest("button[data-preview-url]");
    if (coverPreview) {
        coverPreviewImage.src = coverPreview.dataset.previewUrl;
        coverPreviewImage.alt = coverPreview.getAttribute("aria-label") || "Capa da obra";
        coverPreviewDialog.showModal();
        return;
    }

    if (event.target === coverPreviewDialog || event.target.closest(".cover-preview-close")) {
        coverPreviewDialog.close();
        return;
    }

    const button = event.target.closest("button[data-decision]");
    if (!button) return;
    const card = button.closest(".approval-card");
    const decision = button.dataset.decision;
    const kind = card.dataset.kind;
    const requestId = card.dataset.requestId;
    if (decision === "reprovar" && !await confirmInPage({
        title: "Reprovar pedido?",
        message: "O pedido será marcado como reprovado. Deseja continuar?",
        confirmLabel: "Reprovar pedido",
        destructive: true
    })) return;

    const cardButtons = [...card.querySelectorAll("button[data-decision]")];
    cardButtons.forEach((item) => { item.disabled = true; });
    showFeedback(decision === "aprovar" ? "Aprovando pedido..." : "Reprovando pedido...");
    try {
        const requestType = kind === "moderation" ? "moderacao" : "obra";
        await apiRequest(`/api/pedido_${requestType}/${encodeURIComponent(requestId)}/${decision}`, {
            method: "POST"
        });
        await loadRequests();
        showFeedback(decision === "aprovar" ? "Pedido aprovado." : "Pedido reprovado.");
    } catch (error) {
        console.error("Não foi possível analisar o pedido:", error);
        showFeedback(error.message || "Não foi possível analisar o pedido.", true);
        cardButtons.forEach((item) => { item.disabled = false; });
    }
});

document.querySelector(".cover-preview-close").addEventListener("click", () => coverPreviewDialog.close());

async function initialize() {
    try {
        const user = await account.get();
        if (user.email?.trim().toLowerCase() !== adminEmail && !user.labels?.includes("admin")) {
            window.location.replace("/");
            return;
        }
        await loadRequests();
    } catch (error) {
        if (error.code === 401) {
            login();
            return;
        }
        console.error("Não foi possível carregar a homologação:", error);
        showFeedback(error.message || "Não foi possível carregar os pedidos.", true);
    }
}

void initialize();
