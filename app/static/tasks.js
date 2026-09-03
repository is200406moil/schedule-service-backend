(() => {
  const toast = document.getElementById("tasks-toast");
  if (!toast) return;

  const storedMessage = sessionStorage.getItem("tasks-toast");
  if (storedMessage) {
    sessionStorage.removeItem("tasks-toast");
    toast.textContent = storedMessage;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  document.querySelectorAll("[data-task-status-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      const row = button.closest("[data-task-row]");
      const nextStatus = button.dataset.nextStatus;
      try {
        const response = await fetch(`/tasks/${button.dataset.taskStatusToggle}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content,
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!response.ok) throw new Error("task update failed");
        button.classList.toggle("is-checked", nextStatus === "done");
        button.setAttribute("aria-checked", nextStatus === "done" ? "true" : "false");
        row.classList.add("is-updating");
        sessionStorage.setItem(
          "tasks-toast",
          nextStatus === "done" ? "Задача выполнена" : "Задача снова в работе",
        );
        window.setTimeout(() => window.location.reload(), 260);
      } catch (error) {
        button.disabled = false;
        button.classList.add("has-error");
        window.setTimeout(() => button.classList.remove("has-error"), 800);
      }
    });
  });

  document.addEventListener("click", (event) => {
    document.querySelectorAll(".task-menu[open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute("open");
    });
  });
})();
