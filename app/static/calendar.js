(() => {
  const dataNode = document.getElementById("calendar-data");
  if (!dataNode) return;

  const config = JSON.parse(dataNode.textContent || "{}");
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  const monthNamesGenitive = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const weekdayNames = [
    "Воскресенье", "Понедельник", "Вторник", "Среда",
    "Четверг", "Пятница", "Суббота",
  ];

  const calendarGrid = document.getElementById("calendar-grid");
  const monthTitle = document.getElementById("month-title");
  const agendaWeekday = document.getElementById("agenda-weekday");
  const agendaTitle = document.getElementById("agenda-title");
  const weekParity = document.getElementById("week-parity");
  const lessonCount = document.getElementById("lesson-count");
  const dayLessons = document.getElementById("day-lessons");
  const dayTaskCount = document.getElementById("day-task-count");
  const dayTasks = document.getElementById("day-tasks");
  const modal = document.getElementById("task-modal");
  const modalForm = document.getElementById("modal-task-form");
  const modalHeading = document.getElementById("task-modal-title");
  const modalTitle = document.getElementById("modal-title");
  const modalSubject = document.getElementById("modal-subject");
  const modalDueAt = document.getElementById("modal-due-at");
  const modalReturnTo = document.getElementById("modal-return-to");
  const toast = document.getElementById("calendar-toast");

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function dateKey(value) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year
      || parsed.getMonth() !== month - 1
      || parsed.getDate() !== day
    ) return null;
    return parsed;
  }

  function sameDate(left, right) {
    return dateKey(left) === dateKey(right);
  }

  function academicWeekNumber(value) {
    const year = value.getFullYear();
    const semesterStart = value.getMonth() >= 8
      ? new Date(year, 8, 1)
      : new Date(year, 1, 9);
    const firstMonday = new Date(semesterStart);
    firstMonday.setDate(semesterStart.getDate() - ((semesterStart.getDay() + 6) % 7));
    const valueUtc = Date.UTC(year, value.getMonth(), value.getDate());
    const mondayUtc = Date.UTC(
      firstMonday.getFullYear(),
      firstMonday.getMonth(),
      firstMonday.getDate(),
    );
    return Math.max(1, Math.floor((valueUtc - mondayUtc) / 604800000) + 1);
  }

  function weekParityValue(value) {
    return academicWeekNumber(value) % 2 === 0 ? 2 : 1;
  }

  function scheduleDayKey(value) {
    return value.getDay() === 0 ? 7 : value.getDay();
  }

  function makeIcon(name, className = "icon") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#${name}`);
    svg.appendChild(use);
    return svg;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  const initialDate = parseDate(config.initialDate) || new Date();
  const state = {
    selected: initialDate,
    view: new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
    schedule: null,
    scheduleLoading: Boolean(config.group),
    scheduleError: false,
    tasks: Array.isArray(config.tasks) ? config.tasks : [],
    initialLesson: config.initialLesson || "",
  };

  function lessonsForDate(value) {
    if (!state.schedule) return [];
    const day = state.schedule[String(scheduleDayKey(value))];
    if (!day || !Array.isArray(day.lessons)) return [];
    const parity = weekParityValue(value);
    return day.lessons.flatMap((slot) =>
      slot.filter(
        (lesson) => Array.isArray(lesson.weeks) && lesson.weeks.includes(parity),
      ),
    );
  }

  function tasksForDate(value) {
    const key = dateKey(value);
    return state.tasks
      .filter((task) => task.due_at && task.due_at.slice(0, 10) === key)
      .sort((left, right) => left.due_at.localeCompare(right.due_at));
  }

  function renderCalendar() {
    monthTitle.textContent = `${monthNames[state.view.getMonth()]} ${state.view.getFullYear()}`;
    calendarGrid.replaceChildren();

    const firstOfMonth = new Date(state.view.getFullYear(), state.view.getMonth(), 1);
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(state.view.getFullYear(), state.view.getMonth(), 1 - offset);

    for (let index = 0; index < 42; index += 1) {
      const cellDate = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index,
      );
      const lessons = lessonsForDate(cellDate);
      const tasks = tasksForDate(cellDate).filter((task) => task.status !== "done");
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "month-day";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-label",
        `${cellDate.getDate()} ${monthNamesGenitive[cellDate.getMonth()]}, пар: ${lessons.length}, задач: ${tasks.length}`,
      );
      if (cellDate.getMonth() !== state.view.getMonth()) cell.classList.add("outside-month");
      if (sameDate(cellDate, new Date())) cell.classList.add("is-today");
      if (sameDate(cellDate, state.selected)) {
        cell.classList.add("is-selected");
        cell.setAttribute("aria-selected", "true");
      }
      if (cellDate.getDay() === 0 || cellDate.getDay() === 6) cell.classList.add("is-weekend");

      const number = document.createElement("span");
      number.className = "month-day-number";
      number.textContent = String(cellDate.getDate());
      cell.appendChild(number);

      const stats = document.createElement("span");
      stats.className = "month-day-stats";
      if (lessons.length) {
        const lessonStat = document.createElement("span");
        lessonStat.className = "day-stat day-stat-lessons";
        const dot = document.createElement("i");
        dot.className = "legend-dot lesson-dot";
        const count = document.createElement("b");
        count.textContent = String(lessons.length);
        lessonStat.append(dot, count);
        stats.appendChild(lessonStat);
      }
      if (tasks.length) {
        const taskStat = document.createElement("span");
        taskStat.className = "day-stat day-stat-tasks";
        const dot = document.createElement("i");
        dot.className = "legend-dot task-dot";
        const count = document.createElement("b");
        count.textContent = String(tasks.length);
        taskStat.append(dot, count);
        stats.appendChild(taskStat);
      }
      cell.appendChild(stats);
      cell.addEventListener("click", () => {
        state.selected = cellDate;
        state.view = new Date(cellDate.getFullYear(), cellDate.getMonth(), 1);
        state.initialLesson = "";
        window.history.replaceState({}, "", `/ui/calendar?date=${dateKey(cellDate)}`);
        renderCalendar();
        renderAgenda();
      });
      calendarGrid.appendChild(cell);
    }
  }

  function renderAgendaEmpty(root, iconName, title, copy, actionText = "") {
    root.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "agenda-empty";
    const icon = document.createElement("span");
    icon.className = "agenda-empty-icon";
    icon.appendChild(makeIcon(iconName));
    const heading = document.createElement("strong");
    heading.textContent = title;
    const text = document.createElement("span");
    text.textContent = copy;
    empty.append(icon, heading, text);
    if (actionText) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "agenda-empty-action";
      action.textContent = actionText;
      action.addEventListener("click", () => openTaskModal());
      empty.appendChild(action);
    }
    root.appendChild(empty);
  }

  function renderLessonSkeletons() {
    dayLessons.replaceChildren();
    for (let index = 0; index < 2; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "agenda-skeleton";
      const time = document.createElement("i");
      const content = document.createElement("span");
      content.append(document.createElement("i"), document.createElement("i"));
      skeleton.append(time, content);
      dayLessons.appendChild(skeleton);
    }
  }

  function renderLessons() {
    if (!config.group) {
      lessonCount.textContent = "0";
      renderAgendaEmpty(
        dayLessons,
        "icon-graduation-cap",
        "Укажите учебную группу",
        "Тогда здесь появятся занятия на выбранный день.",
      );
      return;
    }
    if (state.scheduleLoading) {
      lessonCount.textContent = "—";
      renderLessonSkeletons();
      return;
    }
    if (state.scheduleError) {
      lessonCount.textContent = "—";
      renderAgendaEmpty(
        dayLessons,
        "icon-cloud-off",
        "Расписание не загрузилось",
        "Задачи и календарь по-прежнему доступны.",
      );
      return;
    }

    const lessons = lessonsForDate(state.selected);
    lessonCount.textContent = String(lessons.length);
    if (!lessons.length) {
      renderAgendaEmpty(
        dayLessons,
        "icon-coffee",
        "В этот день нет пар",
        "Можно сосредоточиться на своих задачах.",
      );
      return;
    }

    dayLessons.replaceChildren();
    lessons.forEach((lesson) => {
      const card = document.createElement("article");
      card.className = "agenda-lesson";
      const lessonTime = String(lesson.time_start || "").slice(0, 5);
      if (state.initialLesson && lessonTime === state.initialLesson) {
        card.classList.add("is-highlighted");
      }

      const time = document.createElement("span");
      time.className = "agenda-lesson-time";
      const start = document.createElement("strong");
      start.textContent = lessonTime || "—";
      const end = document.createElement("small");
      end.textContent = String(lesson.time_end || "").slice(0, 5);
      time.append(start, end);

      const content = document.createElement("div");
      content.className = "agenda-lesson-content";
      const name = document.createElement("strong");
      name.textContent = lesson.name || "Занятие";
      const meta = document.createElement("div");
      meta.className = "agenda-lesson-meta";
      if (lesson.types) {
        const type = document.createElement("span");
        type.className = "lesson-type";
        type.textContent = lesson.types;
        meta.appendChild(type);
      }
      const rooms = Array.isArray(lesson.rooms) ? lesson.rooms.filter(Boolean) : [];
      if (rooms.length) {
        const room = document.createElement("span");
        room.append(makeIcon("icon-map-pin", "icon"), document.createTextNode(rooms.join(", ")));
        meta.appendChild(room);
      }
      const teachers = Array.isArray(lesson.teachers) ? lesson.teachers.filter(Boolean) : [];
      if (teachers.length) {
        const teacher = document.createElement("span");
        teacher.append(makeIcon("icon-user", "icon"), document.createTextNode(teachers.join(", ")));
        meta.appendChild(teacher);
      }
      content.append(name, meta);

      const add = document.createElement("button");
      add.type = "button";
      add.className = "lesson-task-button";
      add.setAttribute("aria-label", `Создать задачу по предмету ${lesson.name || ""}`);
      add.setAttribute("title", "Создать задачу по предмету");
      add.appendChild(makeIcon("icon-plus"));
      add.addEventListener("click", () => openTaskModal(lesson));

      card.append(time, content, add);
      dayLessons.appendChild(card);
    });

    const highlighted = dayLessons.querySelector(".is-highlighted");
    if (highlighted) {
      window.setTimeout(
        () => highlighted.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        120,
      );
    }
  }

  function renderTasks() {
    const tasks = tasksForDate(state.selected);
    dayTaskCount.textContent = String(tasks.length);
    if (!tasks.length) {
      renderAgendaEmpty(
        dayTasks,
        "icon-list-checks",
        "Задач на этот день нет",
        "Добавьте дело, чтобы не держать его в голове.",
        "Добавить задачу",
      );
      return;
    }

    dayTasks.replaceChildren();
    tasks.forEach((task) => {
      const row = document.createElement("div");
      row.className = `agenda-task${task.status === "done" ? " is-done" : ""}`;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `task-state-toggle${task.status === "done" ? " is-checked" : ""}`;
      toggle.setAttribute("role", "checkbox");
      toggle.setAttribute("aria-checked", task.status === "done" ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        task.status === "done" ? `Вернуть задачу ${task.title} в работу` : `Завершить задачу ${task.title}`,
      );
      toggle.appendChild(makeIcon("icon-check"));
      toggle.addEventListener("click", () => toggleTask(task, toggle));

      const href = document.createElement("a");
      const returnTo = "/ui/calendar";
      href.href = `/ui/tasks/${task.id}/edit?return_to=${encodeURIComponent(returnTo)}`;
      href.className = "agenda-task-content";
      const title = document.createElement("strong");
      title.textContent = task.title;
      const meta = document.createElement("span");
      const subject = task.subject || "Без предмета";
      const time = task.due_at ? task.due_at.slice(11, 16) : "";
      meta.textContent = [subject, time].filter(Boolean).join(" · ");
      href.append(title, meta);
      row.append(toggle, href);
      dayTasks.appendChild(row);
    });
  }

  async function toggleTask(task, button) {
    if (button.disabled) return;
    button.disabled = true;
    const nextStatus = task.status === "done" ? "todo" : "done";
    try {
      const response = await fetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("task update failed");
      task.status = nextStatus;
      showToast(nextStatus === "done" ? "Задача выполнена" : "Задача снова в работе");
      renderCalendar();
      renderTasks();
    } catch (error) {
      button.disabled = false;
      button.classList.add("has-error");
      window.setTimeout(() => button.classList.remove("has-error"), 800);
    }
  }

  function renderAgenda() {
    agendaWeekday.textContent = weekdayNames[state.selected.getDay()];
    agendaTitle.textContent = `${state.selected.getDate()} ${monthNamesGenitive[state.selected.getMonth()]}`;
    const parity = weekParityValue(state.selected);
    weekParity.textContent = parity === 1 ? "Нечётная неделя" : "Чётная неделя";
    renderLessons();
    renderTasks();
  }

  function openTaskModal(lesson = null) {
    modalForm.reset();
    const selectedKey = dateKey(state.selected);
    const lessonTime = lesson ? String(lesson.time_start || "").slice(0, 5) : "18:00";
    modalHeading.textContent = lesson ? "Задача по предмету" : "Новая задача";
    modalSubject.value = lesson?.name || "";
    modalDueAt.value = `${selectedKey}T${lessonTime || "18:00"}`;
    const lessonQuery = lesson && lessonTime
      ? `&lesson=${encodeURIComponent(lessonTime)}`
      : "";
    modalReturnTo.value = `/ui/calendar?date=${selectedKey}${lessonQuery}`;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => modalTitle.focus(), 40);
  }

  function closeTaskModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function selectAdjacentMonth(delta) {
    const year = state.view.getFullYear();
    const month = state.view.getMonth() + delta;
    const targetFirst = new Date(year, month, 1);
    const lastDay = new Date(
      targetFirst.getFullYear(),
      targetFirst.getMonth() + 1,
      0,
    ).getDate();
    const selectedDay = Math.min(state.selected.getDate(), lastDay);
    state.view = targetFirst;
    state.selected = new Date(targetFirst.getFullYear(), targetFirst.getMonth(), selectedDay);
    state.initialLesson = "";
    window.history.replaceState({}, "", `/ui/calendar?date=${dateKey(state.selected)}`);
    renderCalendar();
    renderAgenda();
  }

  document.getElementById("prev-month").addEventListener("click", () => selectAdjacentMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => selectAdjacentMonth(1));
  document.getElementById("calendar-today").addEventListener("click", () => {
    state.selected = new Date();
    state.view = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
    state.initialLesson = "";
    window.history.replaceState({}, "", `/ui/calendar?date=${dateKey(state.selected)}`);
    renderCalendar();
    renderAgenda();
  });
  document.getElementById("agenda-new-task").addEventListener("click", () => openTaskModal());
  modal.addEventListener("click", (event) => {
    if (event.target.closest('[data-close="modal"]')) closeTaskModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) closeTaskModal();
  });

  renderCalendar();
  renderAgenda();

  if (config.group) {
    fetch(`${config.scheduleApi}/${encodeURIComponent(config.group)}/full_schedule`)
      .then((response) => {
        if (!response.ok) throw new Error("schedule unavailable");
        return response.json();
      })
      .then((data) => {
        state.schedule = data.schedule || null;
        state.scheduleLoading = false;
        renderCalendar();
        renderAgenda();
      })
      .catch(() => {
        state.scheduleLoading = false;
        state.scheduleError = true;
        renderCalendar();
        renderAgenda();
      });
  }
})();
