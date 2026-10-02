const formCadastro = document.getElementById("formCadastro");

const btnLogin = document.getElementById("btnLogin");


formCadastro.addEventListener("submit", function(event) {

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


    // Cadastro realizado

    alert("Cadastro realizado com sucesso!");

});