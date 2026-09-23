import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { BootData } from "./types";
import "./styles.css";
import "./responsive.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as BootData;
  createRoot(root).render(<App boot={boot} />);
}
