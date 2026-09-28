# Texture Tools

Browser-based tools for 3D texture prep:

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
