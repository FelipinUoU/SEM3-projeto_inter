const btnCadastro = document.getElementById("btnCadastro");

const formLogin = document.getElementById("formLogin");
const apiBaseUrl = window.location.protocol === "file:" ? "http://localhost:3001" : "";


/* Ir para cadastro */

if (btnCadastro) {
    btnCadastro.addEventListener("click", function () {
        window.location.href = new URL("../HTML/Cadastro.html", import.meta.url).href;
    });
}


/* Login */

formLogin.addEventListener("submit", async function (event) {

    event.preventDefault();

    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    if (email === "" || senha === "") {
        alert("Preencha todos os campos.");
        return;
    }

    try {
        const resp = await fetch(`${apiBaseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const contentType = resp.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await resp.json() : null;
        if (!data) {
            throw new Error(`Resposta inesperada do servidor (HTTP ${resp.status}). Confirme que a API está ativa na porta 3001.`);
        }
        if (!resp.ok) throw new Error(data.error || 'Erro no login');

        alert('Login realizado com sucesso!');
        sessionStorage.setItem('user', JSON.stringify(data.user));
<<<<<<< HEAD
        window.location.href = new URL("../HTML/Usuario.html", import.meta.url).href;
=======
<<<<<<< HEAD
        window.location.href = '/index.html';
=======
        window.location.href = '/HTML/Usuario.html';
>>>>>>> 8cd0986909a285651add6a2fd2d2718708ba32e6
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5

    } catch (err) {
        console.error(err);
        alert('Falha no login: ' + err.message);
    }

});