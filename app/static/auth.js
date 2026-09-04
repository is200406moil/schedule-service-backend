(() => {
  "use strict";

  const configElement = document.getElementById("auth-data");
  const config = configElement ? JSON.parse(configElement.textContent) : {};
  const groupRoot = document.querySelector('[data-autocomplete="groups"]');
  const avatarInput = document.getElementById("register-avatar");
  const avatarFileName = document.getElementById("avatar-file-name");

  if (groupRoot && config.groupsApi) {
    fetch(config.groupsApi)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const groups = Array.isArray(data) ? data : data.groups || [];
        window.SemesterAutocomplete.init(groupRoot, groups);
      })
      .catch(() => window.SemesterAutocomplete.init(groupRoot, []));
  }

  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    avatarFileName.textContent = file ? file.name : "Выбрать файл";
  });
})();
