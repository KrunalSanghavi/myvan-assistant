import { test, expect, connectDemo, tab, readStorage, seedStorage } from "./fixtures.mjs";

async function openReport(page) {
  await tab(page, "Health");
  await page.locator("#view-health [data-go=report]").click();
  await expect(page.locator("#topTitle")).toHaveText("Health report");
}
const mailBody = async page => {
  const href = await page.locator("#repEmail").getAttribute("href");
  const u = new URL(href);
  return { subject: u.searchParams.get("subject"), body: u.searchParams.get("body"), href };
};

test("demo van report: codes, report card, VIN, and a refresh from the van", async ({ page }) => {
  await connectDemo(page);
  await openReport(page);
  const doc = page.locator("#reportDoc");
  await expect(doc.getByRole("heading", { name: "Vehicle health report" })).toBeVisible();
  await expect(doc).toContainText("5FNRL6H9XJBDEMO01");
  await expect(doc).toContainText("Demo van (simulated data)");
  await expect(page.locator("#repFresh")).toContainText("self-tests");   // codes are read on connect; self-tests aren't
  await page.getByRole("button", { name: "Read them now" }).click();
  await expect(page.locator("#repFresh")).toBeEmpty({ timeout: 30000 });
  await expect(doc).toContainText("P0456");
  await expect(doc.locator("h2", { hasText: "Readiness monitors" })).toBeVisible();
  await expect(doc.locator("h2", { hasText: "Report card" })).toBeVisible();
  await expect(doc).toContainText("Fuel system, Bank 2, front");
  await expect(doc).toContainText("Average fuel economy");
});

test("before connecting, the report says what hasn't been read", async ({ page }) => {
  await seedStorage(page, {});
  await openReport(page);
  await expect(page.locator("#reportDoc")).toContainText("Codes weren't read");
  await expect(page.locator("#repFresh")).toContainText("Not read yet: trouble codes and self-tests. Connect to the van");
});

test("VIN is optional and service notes are off by default", async ({ page }) => {
  await seedStorage(page, { services: [{ id: "a", part: "oil", date: "2026-10-01", mi: 84000, cost: 59.99, note: "Joe's Garage, 0W-20" }], maint: { odo: "84500", items: { oil: { lastDate: "2026-10-01", lastMi: "84000", fromLog: true } } }, vin: "5FNRL6H9XJB000001" });
  await openReport(page);
  const doc = page.locator("#reportDoc");
  await expect(doc).toContainText("5FNRL6H9XJB000001");
  await expect(doc).toContainText("Engine oil and filter");
  await expect(doc).toContainText("$59.99");
  await expect(doc).not.toContainText("Joe's Garage");
  await page.getByLabel("Include the VIN").uncheck();
  await expect(doc).not.toContainText("5FNRL6H9XJB000001");
  expect((await mailBody(page)).href).not.toContain("5FNRL6H9XJB000001");
  await page.getByLabel("Include service notes").check();
  await expect(doc).toContainText("Joe's Garage");
  const st = await readStorage(page);
  expect(st.repVin).toBe(false);
  expect(st.repNotes).toBe(true);
});

test("Email opens a message with the report as plain text", async ({ page }) => {
  await connectDemo(page);
  await page.evaluate(() => readCodes());
  await openReport(page);
  const m = await mailBody(page);
  expect(m.href.startsWith("mailto:?subject=")).toBe(true);
  expect(m.subject).toBe("Vehicle health report · 5FNRL6H9XJBDEMO01");
  expect(m.body).toContain("VEHICLE HEALTH REPORT");
  expect(m.body).toContain("TROUBLE CODES");
  expect(m.body).toMatch(/- P0456: .+\[Stored\]/);
  expect(m.body).toContain("REPORT CARD");
  expect(m.href.length).toBeLessThanOrEqual(7000);
});

test("a very long report is shortened for email with a note", async ({ page }) => {
  const services = Array.from({ length: 80 }, (_, i) => ({ id: "s" + i, part: "oil", date: "2025-01-" + String(i % 28 + 1).padStart(2, "0"), mi: 50000 + i * 400, cost: 60, note: "x".repeat(60) }));
  await seedStorage(page, { services, repNotes: true });
  await openReport(page);
  const m = await mailBody(page);
  expect(m.href.length).toBeLessThanOrEqual(7200);
  expect(m.body).toContain("Shortened to fit an email");
});

test("Print or save as PDF prints only the report", async ({ page }) => {
  await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await connectDemo(page);
  await openReport(page);
  await page.getByRole("button", { name: "Print or save as PDF" }).click();
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#reportDoc")).toBeVisible();
  await expect(page.locator("nav.tabs")).toBeHidden();
  await expect(page.locator("header.top")).toBeHidden();
  await expect(page.locator("#repPrint")).toBeHidden();
});

test("Share sends the report as a file where the phone supports it", async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.canShare = d => !!(d && d.files);
    navigator.share = async d => { window.__shared = { title: d.title, name: d.files[0].name, type: d.files[0].type, html: await d.files[0].text() }; };
  });
  await connectDemo(page);
  await openReport(page);
  await page.getByRole("button", { name: "Share" }).click();
  await expect.poll(() => page.evaluate(() => window.__shared && window.__shared.name)).toMatch(/^myvan-health-report-\d{4}-\d\d-\d\d\.html$/);
  const sh = await page.evaluate(() => window.__shared);
  expect(sh.type).toBe("text/html");
  expect(sh.html).toMatch(/^<!doctype html>/);
  expect(sh.html).toContain("Vehicle health report");
});

test("without file sharing, the button downloads the report", async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.canShare; delete Navigator.prototype.share; });
  await connectDemo(page);
  await openReport(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^myvan-health-report-.*\.html$/);
});
