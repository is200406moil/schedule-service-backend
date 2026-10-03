import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { PublicApp } from "../features/auth/PublicApp";
import type { PublicBoot } from "../features/auth/types";

const root = document.getElementById("root");
const data = document.getElementById("public-data");

if (root && data?.textContent) {
  const boot = JSON.parse(data.textContent) as PublicBoot;
  createRoot(root).render(<PublicApp boot={boot} />);
}
