# Texture Tools

Browser-based tools for 3D texture prep:

- **Мощение (генератор)** — процедурные тайловые PBR-текстуры мощения под квадрат 2K / 4K.
  Плоскость S × S мм (по умолчанию 4 × 4 м) заполняется только целыми элементами: номинальный размер
  подгоняется до ближайшего целого количества. Раскладки: шов в шов, вразбежку (1/2, 1/3 … случайно),
  ёлочка 90° / 45°, корзинка, шестигранник, плитняк (Вороной). Материалы 1–9, распределение: один,
  смесь по долям, правило рядов (`4 1 >-1` — вставки с промежутками и сдвигом) и ручная кисть по элементам.
  Экспорт: `T_<База>_Diffuse|ERM|Normal_<суффикс>.<UDIM>.png`, PNG 24 bit; ERM = R emissive, G roughness,
  B metallic 0/1; Normal — DirectX (Y−). Опционально Height 16 bit. Проверки правил раскладки — под превью.
  Код: `js/paving/` (`gen.js` — ядро без DOM, тесты: `node tests/paving.test.mjs`).
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
