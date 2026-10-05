const btnCadastro = document.getElementById("btnCadastro");

const formLogin = document.getElementById("formLogin");


/* Ir para cadastro */

if (btnCadastro) {
    btnCadastro.addEventListener("click", function () {
        window.location.href = "/Cadastro";
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
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erro no login');

        alert('Login realizado com sucesso!');
        // guarda info mínima em sessionStorage e redireciona
        sessionStorage.setItem('user', JSON.stringify(data.user));
        // redirecionar para página principal (index.html)
        window.location.href = '/';

    } catch (err) {
        console.error(err);
        alert('Falha no login: ' + err.message);
    }

});