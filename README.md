# Texture Tools

Browser-based tools for 3D texture prep:

- **Мощение (генератор)** — тайловые PBR-текстуры мощения, плитки и кирпичной кладки под квадрат 2K / 4K.
  Плоскость S × S мм (по умолчанию 4 × 4 м) заполняется только целыми элементами: номинальный размер
  подгоняется до ближайшего целого количества. Три шага: **узор** (галерея «Мощение» 36 / «Кирпич» 21,
  нейтральные миниатюры 1 × 1 м; 15 раскладок, включая кирпичные перевязки `L T` / `L T @3`) →
  **материалы** (библиотека 100+ материалов в 10 категориях: граниты, тротуарная плитка, мрамор, клинкер,
  керамогранит, травертин/оникс/сланец, мозаика, дерево, бетон, металл — фото-текстуры CC0 ambientCG 2K
  с цветокоррекцией под конкретный камень, каждый элемент получает свой кусок текстуры, дерево — вдоль доски) →
  **шов** (10 заполнений с вариантами цвета, 25 профилей сечения со схемами: вогнутые, плоские и косые,
  выпуклые, декоративные, деформационные, ландшафтные). Ползунки процедурных эффектов — в «Тонкой настройке».
  Экспорт: `T_<База>_Diffuse|ERM|Normal_<суффикс>.<UDIM>.png`, PNG 24 bit; ERM = R emissive, G roughness,
  B metallic 0/1; Normal — DirectX (Y−). Опционально Height 16 bit. Проверки правил раскладки — под превью.
  Код: `js/paving/` (`gen.js` — ядро без DOM, `materials.js`, `joints.js`, `presets.js`, `textures.js`),
  текстуры: `textures/` (см. `textures/README.md`), сборка библиотеки: `tools/`, тесты: `node tests/paving.test.mjs`.
- **90% Edge Pad** — shrink content to 90%, fill borders with seamless tile continuation. Downloads ZIP with folder `90/`.
- **Normal Map (DX)** — SmartNormal-style height→normal (DirectX, Y inverted by default). Live preview + PNG download.

Pure client-side. No server processing.

## Local

Open `index.html` or:

```bash
npx serve .
```

## Deploy (Vercel)

```powershell
# in project folder
git init
git add .
git commit -m "texture tools: 90% pad + normal DX"

# install vercel CLI if needed
npm i -g vercel

# login + deploy
vercel
# or production:
vercel --prod
```

Or connect the GitHub/GitLab repo in Vercel dashboard → Framework Preset: Other → Root: `.`
