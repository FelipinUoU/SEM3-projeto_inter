async function request(path, { method = "GET", body } = {}) {
    const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
        throw Object.assign(
            new Error(result.error || `A solicitação falhou (HTTP ${response.status}).`),
            { code: response.status }
        );
    }
    return result;
}

export const account = {
    async get() {
        return request("/api/auth/me");
    },

    async create({ email, password, name }) {
        const result = await request("/api/auth/register", {
            method: "POST",
            body: { email, password, name }
        });
        return result.user;
    },

    async createEmailPasswordSession({ email, password }) {
        const result = await request("/api/auth/login", {
            method: "POST",
            body: { email, password }
        });
        return { userId: result.user.$id };
    },

    async deleteSession() {
        return request("/api/auth/logout", { method: "POST" });
    },

    async createRecoveryOTP({ email }) {
        return request("/api/auth/recovery", { method: "POST", body: { email } });
    },

    async updateRecoveryOTP({ userId, secret, password }) {
        return request("/api/auth/recovery/reset", {
            method: "POST",
            body: { userId, secret, password }
        });
    },

    async updatePrefs({ prefs }) {
        return request("/api/account", { method: "PATCH", body: { prefs } });
    },

    async updateName({ name }) {
        return request("/api/account", { method: "PATCH", body: { name } });
    },

    async updateEmail({ email, password }) {
        return request("/api/account", { method: "PATCH", body: { email, password } });
    },

    async updatePassword({ password, oldPassword }) {
        return request("/api/account", {
            method: "PATCH",
            body: { newPassword: password, oldPassword }
        });
    }
};
