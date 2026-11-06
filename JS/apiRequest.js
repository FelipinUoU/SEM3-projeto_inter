export async function apiRequest(url, options = {}) {
    const requestOptions = { ...options };
    delete requestOptions.authenticated;
    const headers = new Headers(requestOptions.headers);
    const body = requestOptions.body;
    const isBlob = typeof Blob !== "undefined" && body instanceof Blob;

    if (body && !isBlob) {
        headers.set("Content-Type", "application/json");
        requestOptions.body = JSON.stringify(body);
    }
    const response = await fetch(url, {
        ...requestOptions,
        credentials: "same-origin",
        headers
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
        const message = typeof data.error === "string"
            ? data.error
            : data.error?.message || `A solicitação falhou (HTTP ${response.status}).`;
        throw Object.assign(new Error(message), { status: response.status });
    }
    if (!contentType.includes("application/json")) {
        throw Object.assign(
            new Error(`Resposta inesperada do servidor (HTTP ${response.status}).`),
            { status: response.status }
        );
    }
    return data;
}
