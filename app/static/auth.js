(() => {
  "use strict";

  const configElement = document.getElementById("auth-data");
  const config = configElement ? JSON.parse(configElement.textContent) : {};
  const groupRoot = document.querySelector('[data-autocomplete="groups"]');
  const avatarInput = document.getElementById("register-avatar");
  const avatarFileName = document.getElementById("avatar-file-name");

  function normalizeKey(value) {
    return (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "");
  }

  function initAutocomplete(root, items) {
    const input = root.querySelector("input");
    const list = root.querySelector(".autocomplete-list");

    function render() {
      const query = normalizeKey(input.value);
      const matches = items
        .filter((item) => !query || normalizeKey(item).includes(query))
        .slice(0, 8);
      list.replaceChildren();
      matches.forEach((value) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "autocomplete-item";
        option.textContent = value;
        option.addEventListener("click", () => {
          input.value = value;
          list.classList.remove("open");
        });
        list.appendChild(option);
      });
      list.classList.toggle("open", matches.length > 0);
    }

    input.addEventListener("focus", render);
    input.addEventListener("input", render);
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) list.classList.remove("open");
    });
  }

  if (groupRoot && config.groupsApi) {
    fetch(config.groupsApi)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const groups = Array.isArray(data) ? data : data.groups || [];
        initAutocomplete(groupRoot, groups);
      })
      .catch(() => initAutocomplete(groupRoot, []));
  }

  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    avatarFileName.textContent = file ? file.name : "Выбрать файл";
  });
})();
