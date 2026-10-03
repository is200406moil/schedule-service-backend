import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { TaskEditorApp } from "../features/tasks/TaskEditorApp";
import type { TaskEditorBootData } from "../shared/types";
import "../shared/styles.css";
import "../shared/responsive.css";
import "../features/tasks/task-editor.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as TaskEditorBootData;
  createRoot(root).render(<TaskEditorApp boot={boot} />);
}
