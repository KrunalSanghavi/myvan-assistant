import { test, expect, connectDemo } from "./fixtures.mjs";

// #61: a normal drive on the real van set off catalyst, fuel and misfire warnings it shouldn't have.
const ids = page => page.evaluate(() => state.findings.map(f => f.id));
const patchVals = (page, extra) => page.evaluate(src => {
  const base = demo._vals || (demo._vals = demo.vals);
  const fn = new Function("v", "n", src);
  let n = 0;
  demo.vals = function () { const v = base.call(this); Object.assign(v, fn(v, n++)); return v; };
}, extra);

test("catalyst at 925° on a hill is normal; over 1000° for a while is critical", async ({ page }) => {
  test.setTimeout(120000);
  await connectDemo(page);
  await patchVals(page, "return { cat1: 925, cat2: 930 };");
  await expect.poll(() => page.evaluate(() => V.cat1), { timeout: 10000 }).toBeGreaterThan(920);
  await page.waitForTimeout(8000);
  expect((await ids(page)).filter(i => i.startsWith("cat"))).toEqual([]);
  await patchVals(page, "return { cat1: 1020 };");
  await expect.poll(async () => (await ids(page)).includes("cat1"), { timeout: 45000 }).toBe(true);
  expect(await page.evaluate(() => state.findings.find(f => f.id === "cat1").level)).toBe("crit");
});

test("a sloshing fuel reading is smoothed and doesn't trigger low fuel", async ({ page }) => {
  await connectDemo(page);
  test.setTimeout(90000);
  // Each fuel read gets the next value, starting with a low one, like the real van's 7–35% swings.
  await page.evaluate(() => { let i = 0; const seq = [7, 16, 30, 6, 15, 17, 7, 18, 31, 14]; const base = demo.vals;
    demo.vals = function () { const v = base.call(this); return Object.assign(v, { fuel: seq[i % seq.length] }); };
    const enc = P.fuel.o.enc; P.fuel.o.enc = x => { i++; return enc(x); }; });
  await expect.poll(() => page.evaluate(() => fuelRaw.length), { timeout: 60000 }).toBeGreaterThanOrEqual(8);
  const fuel = await page.evaluate(() => V.fuel);
  expect(fuel).toBeGreaterThan(12);
  expect(fuel).toBeLessThan(20);
  expect(await page.evaluate(() => !!state.seen.fuel)).toBe(false);
});

test("a misfire or two is fine; a steady average gets Watch with a reason", async ({ page }) => {
  await connectDemo(page);
  const g = await page.evaluate(() => [
    testGrade({ mid: 0xA2, tid: 0x0C, v: 1 }).grade, testGrade({ mid: 0xA7, tid: 0x0C, v: 4 }).grade,
    testGrade({ mid: 0xA2, tid: 0x0B, v: 3 }).grade, testGrade({ mid: 0xA2, tid: 0x0B, v: 6 }).grade, testGrade({ mid: 0xA2, tid: 0x0B, v: 30 }).grade
  ]);
  expect(g).toEqual(["good", "good", "good", "watch", "plan"]);
  const e = await page.evaluate(() => {
    const c = COMPONENTS.find(c => c.misfire);
    state.m06 = { at: new Date(), count: 2, tests: [{ mid: 0xA2, tid: 0x0B, v: 1, min: 0, max: 65535, pass: true }, { mid: 0xA7, tid: 0x0B, v: 7, min: 0, max: 65535, pass: true }] };
    const r = evalComponent(c);
    return { grade: r.grade, why: r.why };
  });
  expect(e.grade).toBe("watch");
  expect(e.why.join(" ")).toContain("Cylinder 6 is misfiring about 7 times per drive");
});
