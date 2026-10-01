import "@fontsource-variable/golos-text/wght.css";
import { createRoot } from "react-dom/client";
import { ProfileApp } from "./ProfileApp";
import type { ProfileBootData } from "./types";
import "./styles.css";
import "./responsive.css";
import "./profile.css";

const root = document.getElementById("root");
const data = document.getElementById("preview-data");
if (root && data?.textContent) {
  createRoot(root).render(<ProfileApp boot={JSON.parse(data.textContent) as ProfileBootData} />);
}
