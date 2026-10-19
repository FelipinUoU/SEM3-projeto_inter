
const formCadastro = document.getElementById("formCadastro");
const formLogin = document.getElementById("formLogin");
const btnLogin = document.getElementById("btnLogin");
const apiBaseUrl = window.location.protocol === "file:" ? "http://localhost:3001" : "";

if (btnLogin) {
    btnLogin.addEventListener("click", function () {
        window.location.href = new URL("../HTML/Login.html", import.meta.url).href;
    });
}

if (formCadastro) {
    formCadastro.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const confirmarEmail = document.getElementById("confirmarEmail").value.trim();

        const senha = document.getElementById("senha").value;
        const confirmarSenha = document.getElementById("confirmarSenha").value;

        // Verifica se os e-mails são iguais.
        if (email.toLowerCase() !== confirmarEmail.toLowerCase()) {
            alert("Os e-mails não são iguais.");
            return;
        }

        // Verifica se as senhas são iguais.
        if (senha !== confirmarSenha) {
            alert("As senhas não são iguais.");
            return;
        }

        try {
            const resp = await fetch(`${apiBaseUrl}/api/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    confirmarEmail,
                    senha,
                    confirmarSenha
                })
            });

            const contentType = resp.headers.get("content-type") || "";
            const data = contentType.includes("application/json") ? await resp.json() : null;

            if (!data) {
                throw new Error(`Resposta inesperada do servidor (HTTP ${resp.status}). Confirme que a API está ativa na porta 3001.`);
            }

            if (!resp.ok) {
                throw new Error(data.mensagem || data.error || "Erro no cadastro.");
            }

            alert(data.mensagem || "Cadastro realizado com sucesso!");

            formCadastro.reset();

            // Redireciona para a tela de login.
            window.location.href = new URL("../HTML/Login.html", import.meta.url).href;

        } catch (err) {
            console.error("Erro no cadastro:", err);
            alert("Erro ao cadastrar: " + err.message);
        }
    });
}
