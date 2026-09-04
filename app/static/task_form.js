(() => {
  const dataNode = document.getElementById("task-form-data");
  if (!dataNode) return;

  const config = JSON.parse(dataNode.textContent || "{}");

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
      window.SemesterAutocomplete.init(root, subjects, { limit: 7 });
    });
  });
})();
