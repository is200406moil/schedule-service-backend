import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";
import { Shell } from "./Shell";
import type { BootData } from "./types";

const user: BootData = {
  firstName: "Исмаил", group: "ИКБО-14-23", avatar: "", today: "2026-10-01", csrfToken: "profile-csrf-token",
};

describe("shared brand", () => {
  it("keeps the full wordmark and period in one word on both header and sidebar", () => {
    const html = renderToStaticMarkup(<Shell user={user}>Содержимое</Shell>);
    expect(html.match(/class="brand-wordmark"/g)).toHaveLength(2);
    expect(html.match(/семестр<span class="brand-period">\.<\/span>/g)).toHaveLength(2);
    expect(html.match(/viewBox="0 0 40 40"/g)).toHaveLength(2);
    expect(html).not.toContain("mobile-brand-mark");
    expect(html).not.toContain("brand-symbol");
  });

  it("links to the overview and gives the decorative SVG no duplicate accessible name", () => {
    const html = renderToStaticMarkup(<Brand className="header-brand" />);
    expect(html).toContain('class="brand header-brand"');
    expect(html).toContain('href="/ui"');
    expect(html).toContain('aria-label="Мой семестр — обзор"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("account menu", () => {
  it("provides native disclosure navigation and a POST logout with the CSRF token", () => {
    const html = renderToStaticMarkup(<AccountMenu user={user} />);
    expect(html).toContain('<details class="account-menu"');
    expect(html).toContain('<summary class="account-toggle" aria-label="Меню аккаунта: Исмаил"');
    expect(html).toContain('href="/ui/profile"');
    expect(html).toContain('href="/ui/profile?edit=1"');
    expect(html).toContain('action="/ui/logout" method="post"');
    expect(html).toContain('type="hidden" name="csrf_token" value="profile-csrf-token"');
    expect(html).not.toContain('href="/ui/logout"');
    expect(html).not.toContain('role="menu"');
  });

  it("marks the profile link current only when viewing the profile section", () => {
    const profileHtml = renderToStaticMarkup(<AccountMenu user={user} isProfile />);
    const overviewHtml = renderToStaticMarkup(<AccountMenu user={user} />);
    expect(profileHtml.match(/aria-current="page"/g)).toHaveLength(1);
    expect(overviewHtml).not.toContain('aria-current="page"');
  });

  it("handles an unnamed account and reserves avatar dimensions", () => {
    const unnamed = renderToStaticMarkup(<AccountMenu user={{ ...user, firstName: " ", group: "" }} />);
    expect(unnamed).toContain("Меню аккаунта: Профиль");
    expect(unnamed).toContain("Группа не указана");
    const photo = renderToStaticMarkup(<AccountMenu user={{ ...user, avatar: "data:image/png;base64,iVBORw0KGgo=" }} />);
    expect(photo).toContain('width="34" height="34"');
    expect(photo).toContain('alt=""');
  });

  it("renders account text safely without turning it into markup", () => {
    const html = renderToStaticMarkup(<AccountMenu user={{ ...user, firstName: "<script>example</script>" }} />);
    expect(html).toContain("&lt;script&gt;example&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("workspace header", () => {
  it("places one account menu in the shared header, not the sidebar or mobile navigation", () => {
    const html = renderToStaticMarkup(<Shell user={user} section="profile" onCreateTask={() => {}}>Профиль</Shell>);
    expect(html.match(/class="account-menu"/g)).toHaveLength(1);
    expect(html).toContain('<header class="workspace-header"');
    expect(html).not.toContain("sidebar-bottom");
    expect(html).not.toContain("profile-link");
    expect(html.match(/href="\/ui\/profile"/g)).toHaveLength(1);
    expect(html).toContain('class="mobile-add"');
  });

  it("keeps mobile task creation fallback and the option to hide it", () => {
    const html = renderToStaticMarkup(<Shell user={user} section="profile">Профиль</Shell>);
    expect(html).toContain('href="/ui/tasks/new?return_to=%2Fui%2Fprofile"');
    const hiddenHtml = renderToStaticMarkup(<Shell user={user} hideMobileAdd>Профиль</Shell>);
    expect(hiddenHtml).not.toContain('class="mobile-add"');
    expect(hiddenHtml).toContain('class="account-menu"');
  });

  it("uses canonical links in both navigation layouts and preserves creation's return state", () => {
    const returnTo = "/ui/calendar?date=2026-10-03&lesson=09%3A00";
    const html = renderToStaticMarkup(<Shell user={user} section="calendar" createReturnTo={returnTo}>Календарь</Shell>);
    expect(html.match(/href="\/ui\/calendar"/g)).toHaveLength(2);
    expect(html.match(/href="\/ui\/tasks"/g)).toHaveLength(2);
    expect(html.match(/href="\/ui"/g)).toHaveLength(4);
    expect(html).toContain('href="/ui/tasks/new?return_to=%2Fui%2Fcalendar%3Fdate%3D2026-10-03%26lesson%3D09%253A00"');
    expect(html).not.toContain("/preview");
  });
});
