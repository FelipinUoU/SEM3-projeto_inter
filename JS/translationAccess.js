export function getTranslationLoginMessage(currentUser) {
    return currentUser ? null : "Faça login para traduzir páginas.";
}

export function shouldRequireLoginForTranslation(currentUser) {
    return !currentUser;
}
