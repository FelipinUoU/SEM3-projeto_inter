const nicknameInput = document.getElementById("nicknameInput");
const nicknameText = document.getElementById("nicknameText");
const nicknameEditButton = document.getElementById("nicknameEditButton");

if (nicknameInput && nicknameText && nicknameEditButton) {
  let nickname = "";

  function closeNicknameEditor() {
    nickname = nicknameInput.value.trim();
    nicknameText.textContent = nickname || "Nickname";
    nicknameInput.hidden = true;
    nicknameEditButton.setAttribute("aria-expanded", "false");
  }

  nicknameEditButton.addEventListener("click", () => {
    nicknameInput.value = nickname;
    nicknameInput.hidden = false;
    nicknameEditButton.setAttribute("aria-expanded", "true");
    nicknameInput.focus();
  });

  nicknameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      closeNicknameEditor();
      nicknameEditButton.focus();
    }
  });

  nicknameInput.addEventListener("blur", closeNicknameEditor);
}
