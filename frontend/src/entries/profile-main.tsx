import "vite/modulepreload-polyfill";
import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { ProfileApp } from "../features/profile/ProfileApp";
import type { ProfileBootData } from "../shared/types";
import "../shared/styles.css";
import "../shared/responsive.css";
import "../features/profile/profile.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");
if (root && data?.textContent) {
  createRoot(root).render(<ProfileApp boot={JSON.parse(data.textContent) as ProfileBootData} />);
}
