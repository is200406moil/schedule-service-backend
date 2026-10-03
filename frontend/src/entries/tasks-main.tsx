import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { TasksApp } from "../features/tasks/TasksApp";
import type { TasksBootData } from "../shared/types";
import "../shared/styles.css";
import "../shared/responsive.css";
import "../features/tasks/tasks.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as TasksBootData;
  createRoot(root).render(<TasksApp boot={boot} />);
}
