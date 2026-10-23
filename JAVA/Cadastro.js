
import { account, ID } from "../JS/JAVA/appwriteClient.js";

const formCadastro = document.getElementById("formCadastro");

if (formCadastro) {
    formCadastro.addEventListener("submit", async (event) => {
        event.preventDefault();

        const nome = document.getElementById("nome").value.trim();
        const email = document.getElementById("email").value.trim();
        const confirmarEmail =
            document.getElementById("confirmarEmail").value.trim();
        const senha = document.getElementById("senha").value;
        const confirmarSenha =
            document.getElementById("confirmarSenha").value;

        if (!nome) {
            alert("Digite seu nome.");
            return;
        }

        if (email.toLowerCase() !== confirmarEmail.toLowerCase()) {
            alert("Os e-mails não são iguais.");
            return;
        }

        if (senha.length < 8) {
            alert("A senha deve ter pelo menos 8 caracteres.");
            document.getElementById("senha").focus();
            return;
        }

        if (senha !== confirmarSenha) {
            alert("As senhas não são iguais.");
            return;
        }

        try {
            await account.create({
                userId: ID.unique(),
                email,
                password: senha,
                name: nome
            });

            alert("Cadastro realizado com sucesso!");
            formCadastro.reset();
            window.location.href = "/HTML/Login.html";

        } catch (err) {
            console.error("Erro no cadastro:", err);

            alert(
                `Erro ao cadastrar!\nCódigo: ${err.code ?? "desconhecido"}\nMensagem: ${err.message || "Tente novamente."}`
            );
        }
    });
}
