// Копирует свежий builder-data.json из компаньона перед сборкой стола:
// стол резолвит имена форм/стилей/архетипов по тем же данным книги.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
copyFileSync(
  new URL("../../dojo-character-builder/public/data/builder-data.json", import.meta.url),
  new URL("../public/data/builder-data.json", import.meta.url),
);
console.log("[sync-data] builder-data.json скопирован из компаньона.", here ? "" : "");
