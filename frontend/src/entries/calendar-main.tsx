import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { CalendarApp } from "../features/calendar/CalendarApp";
import type { CalendarBootData } from "../shared/types";
import "../shared/styles.css";
import "../shared/responsive.css";
import "../features/calendar/calendar.css";

const root = document.getElementById("root");
const data = document.getElementById("page-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as CalendarBootData;
  createRoot(root).render(<CalendarApp boot={boot} />);
}
