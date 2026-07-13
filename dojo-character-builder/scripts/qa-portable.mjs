import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(".ms-playwright");

const appUrl = process.env.DOJO_APP_URL ?? "http://127.0.0.1:5177/";
const tempDir = await fs.mkdtemp(join(tmpdir(), "dojo-portable-"));
const browser = await chromium.launch({ headless: true });

// Хаб-модель: разделы открываются с главной; внутри раздела есть только кнопка «На главную».
async function openSection(page, sectionClass) {
  const back = page.locator("button.hubBack");
  if (await back.count()) await back.click();
  await page.locator(`.homeLaunchRow.${sectionClass}`).click();
}

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });

  await openSection(page, "io");

  const heroCard = page.locator(".ioGrid article").filter({ hasText: "Герой PNG-карточка" });
  if ((await heroCard.count()) !== 1) throw new Error("Hero PNG card export card is not unique.");

  const downloadPromise = page.waitForEvent("download");
  await heroCard.getByRole("button", { name: "Скачать карточку", exact: true }).click();
  const download = await downloadPromise;
  const heroCardPath = join(tempDir, download.suggestedFilename());
  await download.saveAs(heroCardPath);
  const heroCardStat = await fs.stat(heroCardPath);
  if (heroCardStat.size < 1000) throw new Error(`Exported PNG is unexpectedly small: ${heroCardStat.size}`);

  await openSection(page, "heroes");
  await page.getByLabel("Имя персонажа").fill("Перед импортом");
  await openSection(page, "io");
  await page.locator(".ioDropZone input[type='file']").setInputFiles(heroCardPath);
  await page.locator("text=Импортирован и сохранён герой").waitFor({ timeout: 5000 });

  const tinyPath = join(tempDir, "plain-media.png");
  await fs.writeFile(
    tinyPath,
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw0qNAAAAABJRU5ErkJggg==", "base64"),
  );
  await openSection(page, "io");
  await page.locator(".ioDropZone input[type='file']").setInputFiles(tinyPath);
  await page.locator("text=Картинка добавлена").waitFor({ timeout: 5000 });
  const mediaText = await page.locator(".mediaLibrary").innerText();
  if (!mediaText.includes("plain-media.png")) throw new Error("Media library does not show uploaded image.");

  console.log(JSON.stringify({ ok: true, heroCardPath, heroCardSize: heroCardStat.size }, null, 2));
} finally {
  await browser.close();
}
