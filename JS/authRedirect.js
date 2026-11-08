const managementPath = "/HTML/GerenciarObras.html";
const libraryPath = "/HTML/Biblioteca.html";

function isSafeLocalPath(destination) {
    return typeof destination === "string"
        && destination.startsWith("/")
        && !destination.startsWith("//")
        && !destination.includes("\\");
}

export function getPostLoginDestination(user, requestedDestination, referrer, loginPath, origin) {
    const isAdmin = user.email?.trim().toLowerCase() === "hokupedia@gmail.com"
        || user.labels?.includes("admin");
    const safeDestination = isSafeLocalPath(requestedDestination) ? requestedDestination : null;
    const requestedPath = safeDestination
        ? new URL(safeDestination, origin).pathname
        : null;
    let previousPage = null;

    if (referrer) {
        const previousUrl = new URL(referrer);
        if (previousUrl.origin === origin && previousUrl.pathname !== loginPath) {
            previousPage = `${previousUrl.pathname}${previousUrl.search}${previousUrl.hash}`;
        }
    }

    if (safeDestination && (isAdmin || requestedPath !== managementPath)) {
        return safeDestination;
    }
    return isAdmin ? managementPath : previousPage || libraryPath;
}
