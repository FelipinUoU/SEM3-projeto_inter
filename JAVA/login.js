const btnCadastro = document.getElementById("btnCadastro");

const formLogin = document.getElementById("formLogin");


/* Ir para cadastro */

btnCadastro.addEventListener("click", function () {

    window.location.href = "cadastro.html";

});


/* Login */

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

});