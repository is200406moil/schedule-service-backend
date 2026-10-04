import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { App } from "../features/overview/App";
import type { BootData } from "../shared/types";
import "../shared/styles.css";
import "../shared/responsive.css";

const root = document.getElementById("root");
const data = document.getElementById("page-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as BootData;
  createRoot(root).render(<App boot={boot} />);
}
