(() => {
  const dataNode = document.getElementById("task-form-data");
  if (!dataNode) return;

  const config = JSON.parse(dataNode.textContent || "{}");

  function normalizeKey(value) {
    return (value || "").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
  }

  function initAutocomplete(root, source) {
    const input = root.querySelector("input");
    const list = root.querySelector(".autocomplete-list");

    function render(values) {
      list.replaceChildren();
      values.slice(0, 7).forEach((value) => {
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
      list.classList.toggle("open", values.length > 0);
    }

    function filter() {
      const query = normalizeKey(input.value);
      render(source.filter((value) => !query || normalizeKey(value).includes(query)));
    }

    input.addEventListener("input", filter);
    input.addEventListener("focus", filter);
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) list.classList.remove("open");
    });
  }

  async function loadSubjects() {
    if (!config.userGroup) return [];
    try {
      const response = await fetch(
        `${config.subjectsApi}/${encodeURIComponent(config.userGroup)}/full_schedule`,
      );
      if (!response.ok) return [];
      const data = await response.json();
      const names = new Set();
      Object.values(data.schedule || {}).forEach((day) => {
        (day.lessons || []).forEach((slot) => {
          slot.forEach((lesson) => {
            if (lesson.name) names.add(lesson.name);
          });
        });
      });
      return Array.from(names).sort((left, right) => left.localeCompare(right, "ru"));
    } catch (error) {
      return [];
    }
  }

  const params = new URLSearchParams(window.location.search);
  const subjectPrefill = params.get("subject");
  if (subjectPrefill) document.getElementById("task-subject").value = subjectPrefill;

  loadSubjects().then((subjects) => {
    document.querySelectorAll('[data-autocomplete="subjects"]').forEach((root) => {
      initAutocomplete(root, subjects);
    });
  });
})();
