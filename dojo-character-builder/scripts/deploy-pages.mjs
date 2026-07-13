// Публикация собранного приложения (dist/) на GitHub Pages.
//
// Почему так: репозиторий перевода публиковать нельзя (PDF книги, черновики),
// поэтому наружу уходит ТОЛЬКО содержимое dist/ — оно пушится force-коммитом
// в отдельный репозиторий, из которого GitHub Pages раздаёт статику.
//
// Использование:
//   1) gh auth login                       — один раз авторизовать GitHub CLI
//   2) npm run deploy:pages                — соберёт и опубликует
//
// Репозиторий назначения берётся из package.json → "dojoPages": { "repo": "owner/name" }.
// Если репозитория ещё нет, скрипт создаст его через gh (публичный).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

// fs.cpSync на этой машине падает нативно (без исключения) при копировании dist в %TEMP%,
// поэтому копируем системным xcopy.
function copyDir(src, dst) {
  execFileSync("xcopy", [src, dst, "/E", "/I", "/Q", "/Y"], { stdio: ["ignore", "ignore", "pipe"] });
}
const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
const repo = pkg.dojoPages?.repo;

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function fail(message) {
  console.error(`\n[deploy-pages] ${message}\n`);
  process.exit(1);
}

if (!repo || repo.includes("<")) {
  fail(
    'Не задан репозиторий назначения. В package.json заполните:\n  "dojoPages": { "repo": "ваш-логин/dojo-companion" }',
  );
}

const dist = join(appRoot, "dist");
if (!existsSync(join(dist, "index.html"))) {
  fail("Папка dist/ пуста — сначала соберите приложение: npm run build");
}

// Стол публикуется вместе с компаньоном: компаньон в корень, стол в /table/.
const tableDist = join(appRoot, "..", "dojo-table", "dist");
const hasTable = existsSync(join(tableDist, "index.html"));
if (!hasTable) {
  console.warn("[deploy-pages] dist стола не найден — публикуется только компаньон (соберите dojo-table: npm run build).");
}

// Проверяем авторизацию gh и существование репозитория.
try {
  run("gh", ["auth", "status"]);
} catch {
  fail("GitHub CLI не авторизован. Выполните: gh auth login");
}

let repoExists = true;
try {
  run("gh", ["repo", "view", repo, "--json", "name"]);
} catch {
  repoExists = false;
}
if (!repoExists) {
  console.log(`[deploy-pages] Репозиторий ${repo} не найден — создаю публичный…`);
  run("gh", ["repo", "create", repo, "--public", "--description", "Паника в Додзе — цифровой компаньон (сборка GitHub Pages)"]);
}

// Свежий git-каталог с одним коммитом: история сборок в Pages-репозитории не нужна.
const work = mkdtempSync(join(tmpdir(), "dojo-pages-"));
try {
  copyDir(dist, work);
  if (hasTable) copyDir(tableDist, join(work, "table"));
  // Pages по умолчанию прогоняет сайт через Jekyll; .nojekyll отключает это.
  writeFileSync(join(work, ".nojekyll"), "");

  const git = (...args) => run("git", args, { cwd: work });
  git("init", "--initial-branch", "gh-pages");
  git("add", "-A");
  git("-c", "user.name=dojo-deploy", "-c", "user.email=deploy@localhost", "commit", "-m", `Сборка компаньона v${pkg.version}`);
  const token = run("gh", ["auth", "token"]);
  git("push", "--force", `https://x-access-token:${token}@github.com/${repo}.git`, "gh-pages");

  // Включаем Pages на ветке gh-pages (идемпотентно: если уже включено — игнорируем ошибку).
  try {
    run("gh", ["api", `repos/${repo}/pages`, "-X", "POST", "-f", "source[branch]=gh-pages", "-f", "source[path]=/"]);
  } catch {
    // Уже включено.
  }

  const owner = repo.split("/")[0];
  const name = repo.split("/")[1];
  console.log(`\n[deploy-pages] Готово! Через минуту-две сайт появится на:\n  https://${owner}.github.io/${name}/\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
