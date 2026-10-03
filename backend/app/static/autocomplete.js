(() => {
  "use strict";

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "");
  }

  function init(root, source, options = {}) {
    const input = root?.querySelector("input");
    const list = root?.querySelector(".autocomplete-list");
    if (!input || !list) return;

    const limit = options.limit || 8;
    const items = Array.from(new Set(source.filter(Boolean).map(String)));
    const listId = `${input.id || "autocomplete"}-options`;
    let matches = [];
    let activeIndex = -1;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");
    list.id = listId;
    list.setAttribute("role", "listbox");

    function close() {
      activeIndex = -1;
      list.classList.remove("open");
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function select(value) {
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }

    function setActive(index) {
      const optionsList = Array.from(list.children);
      if (!optionsList.length) return;
      activeIndex = (index + optionsList.length) % optionsList.length;
      optionsList.forEach((option, optionIndex) => {
        const active = optionIndex === activeIndex;
        option.classList.toggle("active", active);
        option.setAttribute("aria-selected", String(active));
      });
      const activeOption = optionsList[activeIndex];
      input.setAttribute("aria-activedescendant", activeOption.id);
      activeOption.scrollIntoView({ block: "nearest" });
    }

    function render() {
      const query = normalizeKey(input.value);
      matches = items
        .filter((item) => !query || normalizeKey(item).includes(query))
        .slice(0, limit);
      activeIndex = -1;
      list.replaceChildren();

      matches.forEach((value, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `${listId}-${index}`;
        option.className = "autocomplete-item";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.textContent = value;
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("mouseenter", () => setActive(index));
        option.addEventListener("click", () => select(value));
        list.appendChild(option);
      });

      const open = matches.length > 0;
      list.classList.toggle("open", open);
      input.setAttribute("aria-expanded", String(open));
      input.removeAttribute("aria-activedescendant");
    }

    input.addEventListener("focus", render);
    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (!matches.length || !list.classList.contains("open")) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(activeIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(activeIndex - 1);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        select(matches[activeIndex]);
      }
    });
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) close();
    });
  }

  window.SemesterAutocomplete = Object.freeze({ init });
})();
