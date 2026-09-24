import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { TasksApp } from "./TasksApp";
import type { TasksBootData } from "./types";
import "./styles.css";
import "./responsive.css";
import "./tasks.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as TasksBootData;
  createRoot(root).render(<TasksApp boot={boot} />);
}
