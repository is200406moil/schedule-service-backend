import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { TaskEditorApp } from "./TaskEditorApp";
import type { TaskEditorBootData } from "./types";
import "./styles.css";
import "./responsive.css";
import "./task-editor.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as TaskEditorBootData;
  createRoot(root).render(<TaskEditorApp boot={boot} />);
}
