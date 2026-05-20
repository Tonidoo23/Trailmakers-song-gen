# Trailmakers Song Builder

Eine lokale Web-App (React + TypeScript + Vite + Tailwind), die Akkorde aus Text wie `[C] ... [Am] ... [F] ... [G]` ausliest und daraus eine **eigene einfache Melodie** für Trailmakers erzeugt.

## Lokal starten

```bash
npm install
npm run dev
```

Dann öffne die angezeigte lokale URL (z. B. `http://localhost:5173`).

## Mit Vercel deployen

### Option A: Vercel Dashboard
1. Repository zu GitHub pushen.
2. Auf [vercel.com](https://vercel.com) "Add New Project" wählen.
3. Repo auswählen.
4. Framework sollte automatisch als **Vite** erkannt werden.
5. Build Command: `npm run build`
6. Output Directory: `dist`
7. Deploy klicken.

Die Einstellungen sind zusätzlich in `vercel.json` hinterlegt.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel
```

Für Production:

```bash
vercel --prod
```

## Features
- Chord Parsing: `[C]`, `[Am]`, `[F#]`, `[Bb]`, `[G7]` etc.
- Lead/Bass/Noise Tone Block Generierung
- 2D Top-Down Blockplan
- Klick auf Block => Trailmakers-Settings rechts
- "Copy Settings" (deutsche Liste)
- JSON-Export

## Hinweis
Die App rekonstruiert keine geschützten Melodien 1:1. Die Melodie wird neu aus Akkordtönen generiert.
