const formCadastro = document.getElementById("formCadastro");

formCadastro.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email = document.getElementById("email").value;
    const confirmarEmail = document.getElementById("confirmarEmail").value;

    const senha = document.getElementById("senha").value;
    const confirmarSenha = document.getElementById("confirmarSenha").value;


    // Verifica se os e-mails são iguais

    if (email !== confirmarEmail) {

        alert("Os e-mails não são iguais.");

        return;
    }


    // Verifica se as senhas são iguais

    if (senha !== confirmarSenha) {

        alert("As senhas não são iguais.");

        return;
    }

    // Enviar para o backend
    try {
        const resp = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: null, idade: null, email, senha })
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erro no cadastro');

        alert('Cadastro realizado com sucesso! Faça login para continuar.');
        // redireciona para login
        window.location.href = '/Login';

    } catch (err) {
        console.error(err);
        alert('Erro ao cadastrar: ' + err.message);
    }

});