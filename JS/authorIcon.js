export function createAuthorIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("class", "author-icon");
    icon.setAttribute("aria-hidden", "true");

    const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    head.setAttribute("cx", "12");
    head.setAttribute("cy", "7");
    head.setAttribute("r", "4");
    icon.append(head);

    const body = document.createElementNS("http://www.w3.org/2000/svg", "path");
    body.setAttribute("d", "M4.5 21v-2a7.5 7.5 0 0 1 15 0v2");
    icon.append(body);

    return icon;
}
