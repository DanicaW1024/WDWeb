# Dan Wang — Portfolio

A minimal, Apple-inspired personal portfolio built around a quiet, interactive particle version of the WD monogram. The interface uses black space, careful typography, real project photography and one restrained blue accent.

## Open it

Open **`index.html`** directly in a modern browser, or serve the folder locally:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`. The WD mark is embedded in `js/logo-data.js`, so the particle sampler also works from a `file://` URL.

## Experience

- **Particle-only intro** — no text; particles appear as a loose cloud around the mark, then glide into place within 1.5 seconds. The finished mark holds for half a second, moves right, and the profile fades in as it travels.
- **Interactive mark** — hover to disturb the particles; clicking scatters them without an energy sweep. The desktop version uses 18,000 bright particles; mobile uses a lighter count.
- **Real project photography** — Bluetooth smart car, line-following robot and three Feeding Foggy screenshots from `picture/`.
- **Minimal navigation** — fixed translucent header, active-section tracking, smooth scrolling and a full-screen mobile menu.
- **Utility interactions** — copy email/phone, project download link, live Hong Kong time and session-based intro skipping.
- **Accessibility** — reduced-motion path, visible focus states, skip link, semantic headings, ARIA labels and a no-JavaScript fallback.

The intro plays once per browser session (`dw-intro-complete`). Click anywhere during the intro, press **Esc**, or tab to the off-screen “Skip intro” button to bypass it.

## Structure

```text
index.html
css/styles.css
js/app.js           Page interactions and intro choreography
js/logo-engine.js   Three.js particle system
js/logo-data.js     Embedded logo used by the particle sampler
vendor/             Local Three.js and GSAP builds
assets/             WD marks, favicon and local fonts
picture/            Project photography
```

## Customization

- Contact details and section copy are in `index.html`.
- Particle counts live in `js/app.js`.
- Colours, type scale and spacing tokens are at the top of `css/styles.css`.
