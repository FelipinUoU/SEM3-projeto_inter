export function normalizeWorkFormat(value) {
    const normalized = String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");

    if (["hq", "hqs", "quadrinho", "quadrinhos"].includes(normalized)) return "hq";
    if (["manhwa", "manhwas"].includes(normalized)) return "manhwa";
    if (["manga", "mangas"].includes(normalized)) return "manga";
    return "";
}
