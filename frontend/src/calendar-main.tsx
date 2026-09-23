import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { CalendarApp } from "./CalendarApp";
import type { CalendarBootData } from "./types";
import "./styles.css";
import "./responsive.css";
import "./calendar.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as CalendarBootData;
  createRoot(root).render(<CalendarApp boot={boot} />);
}
