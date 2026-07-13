# Паника в Додзе — цифровой компаньон

Исходники русского цифрового компаньона и виртуального стола для **Panic at the Dojo**.

- `dojo-character-builder/` — билдер, библиотека, справочник, экспорт и облачные сохранения;
- `dojo-table/` — совместный виртуальный стол;
- `scripts/` и `data/` — воспроизводимая генерация данных компаньона;
- `dojo-character-builder/supabase/` — схема и последовательные миграции Supabase.

## Проверка

```powershell
npm ci --prefix dojo-character-builder
npm ci --prefix dojo-table
npm test --prefix dojo-character-builder
npm test --prefix dojo-table
npm run build --prefix dojo-character-builder
npm run build --prefix dojo-table
```

Ветка `main` содержит исходники. Ветка `gh-pages` генерируется CI и содержит только готовую публикацию.

См. [LICENSE](./LICENSE) для лицензии и атрибуции.
