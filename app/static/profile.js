(() => {
  "use strict";

  const configElement = document.getElementById("profile-data");
  const config = configElement ? JSON.parse(configElement.textContent) : {};
  const modal = document.getElementById("profile-edit-modal");
  const editButtons = [
    document.getElementById("profile-edit"),
    document.getElementById("profile-edit-secondary"),
  ].filter(Boolean);
  const avatarInput = document.getElementById("avatar-input");
  const avatarForm = document.getElementById("profile-avatar-form");

  function openModal() {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => document.getElementById("profile-last-name")?.focus(), 40);
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  editButtons.forEach((button) => button.addEventListener("click", openModal));
  modal.addEventListener("click", (event) => {
    if (event.target.closest('[data-close="modal"]')) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
  });
  if (config.openEdit) openModal();

  if (avatarInput && avatarForm) {
    avatarInput.addEventListener("change", () => {
      if (!avatarInput.files?.length) return;
      const action = document.querySelector(".profile-avatar-action");
      action?.classList.add("is-loading");
      avatarForm.submit();
    });
  }

  const groupRoot = document.querySelector('[data-autocomplete="groups"]');
  if (groupRoot && config.groupsApi) {
    fetch(config.groupsApi)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const groups = Array.isArray(data) ? data : data.groups || [];
        window.SemesterAutocomplete.init(groupRoot, groups);
      })
      .catch(() => window.SemesterAutocomplete.init(groupRoot, []));
  }
})();
