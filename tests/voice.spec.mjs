import { test, expect, tab, seedStorage, connectDemo } from "./fixtures.mjs";

// #49: reliable voice, a spoken conversation on Ask, progress and Cancel. Speech in and out is faked; no network.
async function fakeSpeech(page, { starts = true } = {}) {
  await page.addInitScript(starts => {
    window.__said = []; window.__heard = "";
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speak: u => { window.__said.push(u.text); if (starts && u.onstart) setTimeout(() => u.onstart({}), 20); },
      cancel() {}, resume() {}, paused: false, getVoices: () => [{ lang: "en-US", localService: true, name: "Test voice" }], addEventListener() {}
    } });
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__listens = (window.__listens || 0) + 1; setTimeout(() => { const r = [{ transcript: window.__heard }]; r.isFinal = true; this.onresult && this.onresult({ results: [r] }); this.onend && this.onend(); }, 50); }
      stop() { this.onend && this.onend(); }
    };
  }, starts);
}
const said = page => page.evaluate(() => window.__said);
const openAsk = async page => { await tab(page, "More"); await page.getByRole("button", { name: /^Ask about my van/ }).click(); };
const askQ = async (page, q) => { await page.getByLabel("Your question").fill(q); await page.getByRole("button", { name: "Ask", exact: true }).click(); };
async function withGemini(page, reply = n => `Answer number ${n}.`, { hang = false } = {}) {
  const calls = [];
  await page.context().route("https://generativelanguage.googleapis.com/**", r => {
    calls.push(JSON.parse(r.request().postData() || "{}"));
    if (hang) return;   // never answers
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: reply(calls.length) }] } }] }) });
  });
  await seedStorage(page, {});
  await page.evaluate(() => localStorage.setItem("odxai:cfg", JSON.stringify({ provider: "gemini", keys: { gemini: "AIza" + "T".repeat(35) }, models: { gemini: "gemini-2.5-flash" } })));
  await page.reload();
  return calls;
}

test("Test voice says when the phone played it", async ({ page }) => {
  await fakeSpeech(page);
  await seedStorage(page, {});
  await tab(page, "More"); await page.locator("#view-more [data-go=checks]").first().click();
  await page.getByRole("button", { name: "Test voice" }).click();
  await expect(page.locator("#speakNote")).toContainText("Playing the test");
  expect(await said(page)).toEqual(["Warning. Coolant running hot. This is a test."]);
});

test("Test voice explains what to check when nothing plays", async ({ page }) => {
  await fakeSpeech(page, { starts: false });
  await seedStorage(page, {});
  await tab(page, "More"); await page.locator("#view-more [data-go=checks]").first().click();
  await page.getByRole("button", { name: "Test voice" }).click();
  await expect(page.locator("#speakNote")).toContainText("The phone didn't play the voice", { timeout: 6000 });
  await expect(page.locator("#speakNote")).toContainText("Text-to-speech");
});

test("asking by voice: the question is heard, answered and read aloud", async ({ page }) => {
  await fakeSpeech(page);
  await connectDemo(page);
  await openAsk(page);
  await page.evaluate(() => { window.__heard = "is my battery ok"; });
  await page.getByRole("button", { name: "Talk instead of typing" }).click();
  await expect(page.getByLabel("Your question")).toHaveValue("is my battery ok");
  await expect(page.locator("#askOut")).toContainText("battery", { timeout: 10000 });
  await expect.poll(() => said(page)).toContainEqual(expect.stringMatching(/battery/i));
});

test("follow-up questions carry the conversation; New conversation clears it", async ({ page }) => {
  await fakeSpeech(page);
  const calls = await withGemini(page);
  await openAsk(page);
  await askQ(page, "Should I buy new tires before a road trip?");
  await expect(page.locator("#aiAnswer")).toContainText("Answer number 1.");
  expect(await said(page)).toEqual([]);   // typed, and Read answers aloud is off
  await askQ(page, "What about the spare?");
  await expect(page.locator("#aiAnswer")).toContainText("Answer number 2.");
  const second = JSON.stringify(calls[1]);
  expect(second).toContain("Earlier in this conversation");
  expect(second).toContain("Should I buy new tires before a road trip?");
  expect(second).toContain("Answer number 1.");
  await expect(page.locator("#askThread")).toContainText("Should I buy new tires before a road trip?");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.locator("#askThread")).toBeEmpty();
  await page.getByLabel("Read answers aloud").check();
  await askQ(page, "And the wipers?");
  await expect(page.locator("#aiAnswer")).toContainText("Answer number 3.");
  expect(JSON.stringify(calls[2])).not.toContain("Earlier in this conversation");
  await expect.poll(() => said(page)).toEqual(["Answer number 3."]);
});

test("a slow answer shows progress and can be cancelled", async ({ page }) => {
  await withGemini(page, undefined, { hang: true });
  await openAsk(page);
  await askQ(page, "Should I buy new tires before a road trip?");
  await expect(page.locator("#askWait")).toContainText(/Asking Gemini… \d+ s/, { timeout: 4000 });
  await askQ(page, "Another question");
  await expect(page.locator("#askWait")).toContainText("Still waiting for the last answer");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#askOut")).toContainText("Cancelled.");
});

test("Ask about this on a guide takes a spoken question", async ({ page }) => {
  await fakeSpeech(page);
  await connectDemo(page);
  await tab(page, "Codes");
  await page.locator("#lookupIn").fill("P0171");
  await page.getByRole("button", { name: "Open steps" }).click();
  const sheet = page.getByRole("dialog");
  await page.evaluate(() => { window.__heard = "can I drive to work"; });
  await sheet.getByRole("button", { name: "Talk instead of typing" }).click();
  await expect(sheet.locator(".gask-answer")).toContainText("can I drive to work");
  await expect.poll(() => said(page)).toContainEqual(expect.stringContaining("Demo van"));
});
