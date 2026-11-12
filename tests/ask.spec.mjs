import { test, expect, tab, seedStorage, readStorage, connectDemo } from "./fixtures.mjs";

// No AI provider is ever contacted for real: every provider host is answered here, and calls are recorded.
const HOSTS = { gemini: "https://generativelanguage.googleapis.com/**", claude: "https://api.anthropic.com/**", openai: "https://api.openai.com/**", grok: "https://api.x.ai/**" };
const REPLY = {
  gemini: t => ({ candidates: [{ content: { parts: [{ text: t }] } }] }),
  claude: t => ({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: t }], stop_reason: "end_turn" }),
  openai: t => ({ choices: [{ message: { content: t } }] }),
  grok: t => ({ choices: [{ message: { content: t } }] })
};
async function mockAi(page, text = "**Yes**, check the tread first.\n- Look for wear bars\n- Check pressure cold\n\nThis is guidance, not a guarantee.") {
  const calls = [];
  for (const [p, glob] of Object.entries(HOSTS)) await page.context().route(glob, r => {
    const req = r.request(); calls.push({ p, url: req.url(), headers: req.headers(), body: JSON.parse(req.postData() || "{}") });
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(REPLY[p](text)) });
  });
  return calls;
}
const GKEY = "AIza" + "T".repeat(35);   // the shape of a real Gemini key
const VIN = "5FNRL6H9XJB000001";
const SEED = {
  vin: VIN,
  maint: { odo: "57000", items: { oil: { lastMi: "50000", lastDate: "2026-06-01", fromLog: true } } },
  services: [{ id: "a1", part: "oil", date: "2026-06-01", mi: 50000, cost: 79.5, note: "" }, { id: "a2", part: "airfilter", date: "2025-03-10", mi: 31000, cost: 30, note: "" }],
  drives: [1, 2, 3].map(i => ({ t: Date.UTC(2026, 9, i), dur: 1200, restV: 12.6, crankV: 10.5, runV: 14.1, km: 30, fuelL: 3, idleSec: 120 }))
};
const openAsk = async page => { await tab(page, "More"); await page.getByRole("button", { name: /^Ask about my van/ }).click(); await expect(page.locator("#topTitle")).toHaveText("Ask about my van"); };
const askQ = async (page, q) => { await page.getByLabel("Your question").fill(q); await page.getByRole("button", { name: "Ask", exact: true }).click(); };
const out = page => page.locator("#askOut");
async function setProvider(page, p, key, model) {
  await tab(page, "More");
  await page.locator("#aiProv").selectOption(p);
  await page.locator("#aiKey").fill(key);
  if (model) await page.locator("#aiModel").fill(model);
  await page.locator("#aiForm").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#aiMsg")).toContainText("is ready");
}

test("built-in answers come from the van's own data and never call an AI", async ({ page }) => {
  const calls = await mockAi(page);
  await seedStorage(page, SEED);
  await openAsk(page);
  await page.getByRole("button", { name: "What maintenance is due?" }).click();
  await expect(out(page)).toContainText("Due soon: Engine oil and filter");
  await askQ(page, "when is my next oil change");
  await expect(out(page)).toContainText("Engine oil and filter");
  await expect(out(page)).toContainText("Next one due in about 500 miles");
  await askQ(page, "How much did I spend on the oil change?");
  await expect(out(page)).toContainText("All time: $109.50 over 2 services");
  await page.getByRole("button", { name: "Is my battery OK?" }).click();
  await expect(out(page)).toContainText("averaged 12.60 V over your last 3 drives");
  await askQ(page, "what does P0420 mean");
  await expect(out(page)).toContainText("P0420: Catalytic converter efficiency");
  await expect(out(page).getByRole("link", { name: "Search Google" })).toHaveAttribute("href", /google\.com\/search\?q=2018%20Honda%20Odyssey%20what%20does%20P0420%20mean/);
  expect(calls).toEqual([]);
});

test("without an AI key, an unknown question offers Google and the AI setup", async ({ page }) => {
  const calls = await mockAi(page);
  await seedStorage(page, SEED);
  await openAsk(page);
  await expect(page.locator("#askFoot")).toContainText("you can add an AI provider");
  await askQ(page, "Should I buy new tires before a road trip?");
  await expect(out(page)).toContainText("doesn't have a built-in answer");
  await expect(out(page).getByRole("link", { name: "Search Google" })).toBeVisible();
  await out(page).getByRole("button", { name: "Set up AI answers" }).click();
  await expect(page.locator("#aiProv")).toHaveValue("gemini");
  expect(calls).toEqual([]);
});

test("Gemini answers unknown questions with a facts sheet that never includes the VIN, and the key stays out of backups", async ({ page }) => {
  const calls = await mockAi(page);
  await seedStorage(page, SEED);
  await setProvider(page, "gemini", GKEY);
  await openAsk(page);
  await expect(page.locator("#askFoot")).toContainText("go to Gemini");
  await askQ(page, "Should I buy new tires before a road trip?");
  await expect(page.locator("#aiAnswer")).toContainText("From Gemini");
  await expect(page.locator("#aiAnswer b", { hasText: "Yes" })).toBeVisible();
  await expect(page.locator("#aiAnswer li")).toHaveCount(2);
  expect(calls).toHaveLength(1);
  const c = calls[0], prompt = c.body.contents[0].parts[0].text;
  expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
  expect(c.headers["x-goog-api-key"]).toBe(GKEY);
  expect(c.body.systemInstruction.parts[0].text).toContain("2018 Honda Odyssey Elite");
  expect(prompt).toContain("Question: Should I buy new tires before a road trip?");
  expect(prompt).toContain("VEHICLE HEALTH REPORT");
  expect(prompt).toContain("battery at rest 12.6 V");
  expect(prompt).not.toContain(VIN);
  const st = await readStorage(page);
  expect(JSON.stringify(st)).not.toContain(GKEY);   // not in anything a backup or sync would copy
});

test("Claude: built-in answer first, then Ask Claude for more, with the browser-access header and chosen model", async ({ page }) => {
  const calls = await mockAi(page, "Claude says the battery is fine.");
  await seedStorage(page, SEED);
  await setProvider(page, "claude", "sk-ant-test", "claude-haiku-5-5");
  await openAsk(page);
  await page.getByRole("button", { name: "Is my battery OK?" }).click();
  await expect(out(page)).toContainText("From your van's data");
  expect(calls).toHaveLength(0);
  await out(page).getByRole("button", { name: "Ask Claude for more" }).click();
  await expect(page.locator("#aiAnswer")).toContainText("Claude says the battery is fine.");
  await expect(out(page)).toContainText("averaged 12.60 V");   // the built-in answer stays above
  const c = calls[0];
  expect(c.url).toBe("https://api.anthropic.com/v1/messages");
  expect(c.headers).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
  expect(c.headers["anthropic-beta"]).toBeUndefined();   // Haiku has no refusal fallback
  expect(c.body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 4000 });
  expect(c.body.system).toContain("guidance, not a guarantee");
});

for (const [p, name, model, url] of [["openai", "ChatGPT", "gpt-5-mini", "https://api.openai.com/v1/chat/completions"], ["grok", "Grok", "grok-4", "https://api.x.ai/v1/chat/completions"]]) {
  test(`${name} answers with its default model and a bearer key`, async ({ page }) => {
    const calls = await mockAi(page, `${name} answer here.`);
    await seedStorage(page, SEED);
    await setProvider(page, p, `key-${p}`);
    await openAsk(page);
    await askQ(page, "Is a 2018 Odyssey good for towing a small camper?");
    await expect(page.locator("#aiAnswer")).toContainText(`${name} answer here.`);
    expect(calls[0].url).toBe(url);
    expect(calls[0].headers.authorization).toBe(`Bearer key-${p}`);
    expect(calls[0].body.model).toBe(model);
    expect(calls[0].body.messages[0].role).toBe("system");
  });
}

test("switching providers keeps each provider's key, and keys can be removed", async ({ page }) => {
  await seedStorage(page, {});
  await setProvider(page, "gemini", GKEY);
  await setProvider(page, "claude", "sk-2");
  await page.locator("#aiProv").selectOption("gemini");
  await expect(page.locator("#aiKey")).toHaveAttribute("placeholder", /Key saved/);
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.locator("#aiMsg")).toContainText("Key removed");
  await page.locator("#aiProv").selectOption("claude");
  await expect(page.locator("#aiMsg")).toContainText("Claude is ready (model claude-opus-5-5)");
});

test("demo van gives a sample AI answer without a key and without calling out", async ({ page }) => {
  const calls = await mockAi(page);
  await connectDemo(page);
  await openAsk(page);
  await askQ(page, "Is a 2018 Odyssey good for towing?");
  await expect(page.locator("#aiAnswer")).toContainText("Demo van: this is a sample answer");
  await expect(page.locator("#aiAnswer")).toContainText("From Gemini (demo)");
  await page.getByRole("button", { name: "How healthy is my van?" }).click();
  await expect(out(page)).toContainText("From your van's data");
  expect(calls).toEqual([]);
});

test("a provider that can't be reached gets a clear message and a Google fallback", async ({ page }) => {
  // Fail the request the way a blocked network or extension does.
  await page.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) => String(u).includes("generativelanguage") ? Promise.reject(new TypeError("Failed to fetch")) : f(u, o); });
  await seedStorage(page, SEED);
  await setProvider(page, "gemini", GKEY);
  await openAsk(page);
  await askQ(page, "Is a 2018 Odyssey good for towing a small camper?");
  await expect(page.locator("#askAi .notice")).toContainText("Couldn't reach Gemini");
  await expect(page.locator("#askAi .notice")).toContainText("work network, VPN or blocker extension");
  await expect(page.locator("#askAi").getByRole("link", { name: "Search Google" })).toBeVisible();
});

test("a pasted key is cleaned of hidden characters, and a key that doesn't look like Gemini's gets a warning", async ({ page }) => {
  const calls = await mockAi(page);
  await seedStorage(page, SEED);
  await tab(page, "More");
  await page.locator("#aiKey").fill("  AIza" + "T".repeat(20) + "​" + "T".repeat(15) + " ");   // spaces and a zero-width space
  await page.locator("#aiForm").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#aiMsg")).toContainText("Gemini is ready");
  await openAsk(page);
  await askQ(page, "Is a 2018 Odyssey good for towing a small camper?");
  await expect(page.locator("#aiAnswer")).toContainText("From Gemini");
  expect(calls[0].headers["x-goog-api-key"]).toBe(GKEY);
  await tab(page, "More");
  await page.locator("#aiKey").fill("not-a-real-key");
  await page.locator("#aiForm").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#aiMsg")).toContainText("doesn't look like a Gemini key");
  await expect(page.locator("#aiMsg")).toContainText("this one is 14");
});
