const btnCadastro = document.getElementById("btnCadastro");

const formLogin = document.getElementById("formLogin");
<<<<<<< HEAD
const apiBaseUrl = window.location.protocol === "file:" ? "http://localhost:3001" : "";

/* Ir para cadastro */

if (btnCadastro) {
    btnCadastro.addEventListener("click", function () {
        window.location.href = new URL("../HTML/Cadastro.html", document.baseURI).href;
    });
}
=======


/* Ir para cadastro */

btnCadastro.addEventListener("click", function () {

    window.location.href = "cadastro.html";

});
>>>>>>> 7c5ee50 (Login/cadastro)


/* Login */

<<<<<<< HEAD
formLogin?.addEventListener("submit", async function (event) {

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
        window.location.href = '/';

    } catch (err) {
        console.error(err);
        alert('Falha no login: ' + err.message);
    }
=======
formLogin.addEventListener("submit", function (event) {

    event.preventDefault();

    const email =
        document.getElementById("email").value;

    const senha =
        document.getElementById("senha").value;


    if (email === "" || senha === "") {

        alert("Preencha todos os campos.");

        return;
    }


    alert("Login realizado com sucesso!");
>>>>>>> 7c5ee50 (Login/cadastro)

});