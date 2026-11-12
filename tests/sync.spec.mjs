import { test, expect, tab, seedStorage, readStorage, connectDemo, connectFakeUsb } from "./fixtures.mjs";

// Google is never contacted in tests: sign-in and Drive are answered here from a shared in-memory "cloud".
const CLIENT = "test-client.apps.googleusercontent.com";
let tokenN = 0;
async function fakeGoogle(ctx, cloud = {}) {
  Object.assign(cloud, { calls: [], auth: [], writes: 0, ...cloud });
  await ctx.addInitScript(id => { window.MYVAN_GOOGLE_CLIENT_ID = id; }, CLIENT);
  await ctx.route("https://accounts.google.com/**", r => {
    const u = new URL(r.request().url()), st = u.searchParams.get("state");
    cloud.auth.push(Object.fromEntries(u.searchParams));
    const frag = cloud.deny ? `error=access_denied&state=${st}` : `access_token=tok-${++tokenN}&token_type=Bearer&expires_in=3599&state=${st}`;
    return r.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(u.searchParams.get("redirect_uri") + "#" + frag)})</script>` });
  });
  await ctx.route("https://oauth2.googleapis.com/**", r => { cloud.revoked = true; return r.fulfill({ status: 200, body: "" }); });
  await ctx.route("https://www.googleapis.com/**", r => {
    const req = r.request(), u = new URL(req.url()), m = req.method();
    cloud.calls.push(`${m} ${u.pathname}`);
    if (cloud.expired || !/^Bearer tok-/.test(req.headers().authorization || "")) return r.fulfill({ status: 401, body: "{}" });
    const json = o => r.fulfill({ contentType: "application/json", body: JSON.stringify(o) });
    if (u.pathname === "/drive/v3/about") return json({ user: { emailAddress: "owner@example.com" } });
    if (u.pathname === "/drive/v3/files" && m === "GET") { cloud.spaces = u.searchParams.get("spaces"); return json({ files: cloud.text != null ? [{ id: "f1" }] : [] }); }
    if (u.pathname === "/drive/v3/files/f1" && m === "GET") return r.fulfill({ contentType: "application/json", body: cloud.text });
    if (u.pathname === "/upload/drive/v3/files" && m === "POST") {
      const bd = /boundary=(.+)$/.exec(req.headers()["content-type"])[1];
      const parts = req.postData().split("--" + bd).slice(1, 3).map(p => p.slice(p.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, ""));
      cloud.meta = JSON.parse(parts[0]); cloud.text = parts[1]; cloud.writes++;
      return json({ id: "f1" });
    }
    if (u.pathname === "/upload/drive/v3/files/f1" && m === "PATCH") { cloud.text = req.postData(); cloud.writes++; return json({ id: "f1" }); }
    return r.fulfill({ status: 404, body: "{}" });
  });
  return cloud;
}
// Sign-in state as a previous session would have left it.
const seedSync = (page, v) => page.evaluate(v => { for (const [k, x] of Object.entries(v)) localStorage.setItem("odxsync:" + k, JSON.stringify(x)); }, v);
const signIn = async page => {
  await tab(page, "More");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.locator("#syncWho")).toContainText("owner@example.com", { timeout: 15000 });   // the popup loads a second copy of the app
};
const syncNow = async page => {
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
};
const cloudData = cloud => JSON.parse(cloud.text).data;
const drive = d => ({ t: Date.UTC(2026, 9, d), dur: 1200, ltft1: 1.5 });
const svc = (id, part, mi) => ({ id, part, date: "2026-0" + (mi % 9 + 1) + "-01", mi, cost: null, note: "" });
const msg = page => page.locator("#syncOut .notice");
async function secondDevice(browser, testInfo, cloud) {
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport });
  await fakeGoogle(ctx, cloud);
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/favicon|fonts\.g/.test(m.text())) errors.push(m.text()); });
  return { page, ctx, errors };
}

test("signing in uploads drives, services and notes to the hidden app folder, but not display settings", async ({ page, baseURL }) => {
  const cloud = await fakeGoogle(page.context());
  const seed = { drives: [drive(1)], services: [svc("s1", "oil", 50000)], "note:P0171": "Smoke-tested intake", theme: "dark", units: "metric" };
  await seedStorage(page, seed);
  await signIn(page);
  await expect(page.locator("#syncWhen")).toContainText("Last synced just now");

  expect(cloud.auth[0]).toMatchObject({ client_id: CLIENT, response_type: "token", scope: "https://www.googleapis.com/auth/drive.appdata", redirect_uri: baseURL, prompt: "select_account" });
  expect(cloud.meta).toEqual({ name: "myvan-sync.json", parents: ["appDataFolder"] });
  expect(cloud.spaces).toBe("appDataFolder");
  const file = JSON.parse(cloud.text);
  expect(file).toMatchObject({ app: "myvan-assistant", kind: "sync", format: 1 });
  expect(Object.keys(file.data).sort()).toEqual(["drives", "note:P0171", "services"]);
  expect(page.url()).not.toContain("access_token");
  expect(await readStorage(page)).toEqual(seed);   // sign-in details never land in backups

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(msg(page)).toContainText("Signed out");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect.poll(() => cloud.revoked).toBe(true);
});

test("two devices end up with both sets of changes, and deletions stay deleted", async ({ page, browser }, testInfo) => {
  const cloud = await fakeGoogle(page.context());
  await seedStorage(page, { drives: [drive(1)], services: [svc("s1", "oil", 50000)], maint: { odo: "50000", items: {} } });
  await signIn(page);

  const B = await secondDevice(browser, testInfo, cloud);
  await seedStorage(B.page, { drives: [drive(2)], services: [svc("s2", "plugs", 52000)], "note:P0420": "Cat checked" });
  await signIn(B.page);
  await expect(msg(B.page)).toContainText("Added 1 drive and 1 service record from your other devices");
  let b = await readStorage(B.page);
  expect(b.drives.map(d => d.t)).toEqual([drive(1).t, drive(2).t]);
  expect(b.services.map(s => s.id).sort()).toEqual(["s1", "s2"]);

  await syncNow(page);
  let a = await readStorage(page);
  expect(a.drives).toHaveLength(2);
  expect(a.services.map(s => s.id).sort()).toEqual(["s1", "s2"]);
  expect(a["note:P0420"]).toBe("Cat checked");
  await tab(page, "Health");
  await expect(page.locator("#healthOut")).toContainText("2 drives recorded");

  // Delete the oil change on device B, then sync both.
  await tab(B.page, "Health");
  await B.page.locator("#svcList .item", { hasText: "50,000" }).getByRole("button", { name: "Delete" }).click();
  await B.page.locator("#svcList .item", { hasText: "50,000" }).getByRole("button", { name: "Tap again to delete" }).click();
  await tab(B.page, "More");
  await syncNow(B.page);
  expect(cloudData(cloud).services.map(s => s.id)).toEqual(["s2"]);
  await tab(page, "More");
  await syncNow(page);
  expect((await readStorage(page)).services.map(s => s.id)).toEqual(["s2"]);
  expect(B.errors).toEqual([]);
  await B.ctx.close();
});

test("a passphrase locks the cloud copy; a wrong one is caught and nothing is overwritten", async ({ page, browser }, testInfo) => {
  const cloud = await fakeGoogle(page.context());
  await seedStorage(page, { "note:P0171": "secret note text" });
  await signIn(page);
  await page.getByText("Passphrase (optional)").click();
  await page.getByLabel("Sync passphrase").fill("blue van 42");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#syncWhen")).toContainText("locked with a passphrase");
  await expect.poll(() => cloud.text).toContain('"enc"');
  expect(cloud.text).not.toContain("secret note text");
  const locked = cloud.text;

  const B = await secondDevice(browser, testInfo, cloud);
  await seedStorage(B.page, {});
  await signIn(B.page);
  await expect(msg(B.page)).toContainText("locked with a passphrase");
  await B.page.getByLabel("Sync passphrase").fill("wrong one");
  await B.page.getByRole("button", { name: "Save" }).click();
  await expect(msg(B.page)).toContainText("doesn't unlock");
  await expect(B.page.getByRole("button", { name: /Replace the Google Drive copy/ })).toBeVisible();
  expect(cloud.text).toBe(locked);
  expect((await readStorage(B.page))["note:P0171"]).toBeUndefined();

  await B.page.getByLabel("Sync passphrase").fill("blue van 42");
  await B.page.getByRole("button", { name: "Change" }).click();
  await expect(B.page.locator("#syncWhen")).toContainText("locked with a passphrase");
  await expect.poll(async () => (await readStorage(B.page))["note:P0171"]).toBe("secret note text");
  await expect(msg(B.page)).toHaveCount(0);
  expect(B.errors).toEqual([]);
  await B.ctx.close();
});

// Google tokens last about an hour. (A 401 from Drive takes the same path, but the browser logs it as a console error.)
test("an expired sign-in says so, and Sync now signs in again and syncs", async ({ page }) => {
  const cloud = await fakeGoogle(page.context());
  await page.goto("index.html");
  await seedSync(page, { acct: { email: "owner@example.com" }, token: { v: "tok-old", exp: Date.now() - 1000 } });
  await seedStorage(page, { drives: [drive(3)] });
  await tab(page, "More");
  await expect(msg(page)).toContainText("sign-in has expired");
  expect(cloud.calls).toEqual([]);
  await syncNow(page);
  await expect(page.locator("#syncWhen")).toContainText("Last synced just now");
  expect(cloud.auth[0].login_hint).toBe("owner@example.com");
  expect(cloudData(cloud).drives).toHaveLength(1);
});

test("cancelling Google's sign-in says so and syncs nothing", async ({ page }) => {
  const cloud = await fakeGoogle(page.context(), { deny: true });
  await seedStorage(page, { drives: [drive(3)] });
  await tab(page, "More");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(msg(page)).toContainText("sign-in was cancelled");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeEnabled();
  expect(cloud.calls).toEqual([]);
});

test("offline: says so and sends nothing", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  const cloud = await fakeGoogle(page.context());
  await page.goto("index.html");
  await seedSync(page, { acct: { email: "owner@example.com" }, token: { v: "tok-x", exp: Date.now() + 3e6 } });
  await seedStorage(page, { drives: [drive(3)] });
  await tab(page, "More");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(msg(page)).toContainText("You're offline");
  expect(cloud.calls).toEqual([]);
});

test("without a Google client ID, sign-in explains that sync isn't switched on", async ({ page }) => {
  const calls = [];
  await page.addInitScript(() => { window.MYVAN_GOOGLE_CLIENT_ID = ""; });
  await page.context().route(/accounts.google.com|www.googleapis.com|oauth2.googleapis.com/, r => { calls.push(r.request().url()); return r.abort(); });
  await seedStorage(page, {});
  await tab(page, "More");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(msg(page)).toContainText("isn't switched on");
  expect(calls).toEqual([]);
});

test("the real client ID is built in, and sign-in sends it to Google", async ({ page, baseURL }) => {
  const seen = [];
  await page.context().route("https://accounts.google.com/**", r => { seen.push(new URL(r.request().url())); return r.fulfill({ contentType: "text/html", body: "<p>Google</p>" }); });
  await seedStorage(page, {});
  await tab(page, "More");
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Sign in with Google" }).click()]);
  await popup.waitForLoadState();
  expect(seen[0].searchParams.get("client_id")).toBe("57823011336-c57a4ibllmqcug31a5b56841jkcfhva6.apps.googleusercontent.com");
  expect(seen[0].searchParams.get("redirect_uri")).toBe(baseURL);
  await popup.close();
});

test("demo van syncs to a pretend cloud and never contacts Google", async ({ page }) => {
  const cloud = await fakeGoogle(page.context());
  await connectDemo(page);
  await tab(page, "More");
  await expect(page.locator("#syncOut")).toContainText("never contacts Google");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(msg(page)).toContainText("pretend cloud");
  await syncNow(page);
  expect(cloud.calls).toEqual([]);
  expect(cloud.auth).toEqual([]);
});

test("changes made while connected to the van wait until it disconnects", async ({ page }) => {
  const cloud = await fakeGoogle(page.context());
  await page.goto("index.html");
  await seedSync(page, { acct: { email: "owner@example.com" }, token: { v: "tok-x", exp: Date.now() + 3e6 } });
  await connectFakeUsb(page);
  await expect.poll(() => cloud.writes).toBe(1);   // the sync on opening, before connecting
  await page.evaluate(() => store.set("note:P0300", "Checked plugs"));
  await page.waitForTimeout(5000);
  expect(cloudData(cloud)["note:P0300"]).toBeUndefined();
  await tab(page, "More");
  await expect(page.locator("#syncPaused")).toContainText("automatic sync is paused");
  await expect(page.locator("#syncTip")).toContainText("tap Sync now");
  await page.locator("#discBtn").click();
  await expect(page.locator("#syncPaused")).toHaveCount(0);
  await expect.poll(() => cloud.text && cloudData(cloud)["note:P0300"], { timeout: 10000 }).toBe("Checked plugs");
});
