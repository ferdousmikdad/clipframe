// Clipframe website: the live hero studio, live showcase players and small page enhancements.
import { assetsFrom, createBuiltinRegistry, projectDuration, resolvePluginExport, type BlockRegistry, type Format, type Project } from "../src/index.js";
import { createPlayer, type Player } from "../src/player/index.js";
import { exportSupported, renderToMp4 } from "../src/export/index.js";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const fontsUrl = new URL("fonts", location.href).href.replace(/\/$/, "");
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// ---------- theme toggle (the inline head script sets the first theme) ----------
(function theme() {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = (t: string) => {
    root.setAttribute("data-theme", t);
    meta?.setAttribute("content", t === "light" ? "#fafafa" : "#070707");
  };
  document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* private mode: still switches for this visit */
      }
      apply(next);
    }),
  );
})();

// ---------- tabs ----------
document.querySelectorAll('[role="tablist"]').forEach((list) => tabs(list));
function tabs(list: Element) {
  const all = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const select = (tab: HTMLButtonElement) =>
    all.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls")!);
      if (panel) panel.hidden = !on;
    });
  all.forEach((tab, i) => {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = all[(i + d + all.length) % all.length];
      select(next);
      next.focus();
    });
  });
}

// ---------- copy buttons ----------
document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) =>
  btn.addEventListener("click", async () => {
    const src = document.querySelector(btn.dataset.copy!);
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src.textContent!.trim());
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    } catch {
      /* clipboard unavailable: the text is still selectable */
    }
  }),
);

// ---------- GitHub stars (best effort) ----------
fetch("https://api.github.com/repos/ferdousmikdad/clipframe", { headers: { Accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : null))
  .then((repo: { stargazers_count?: number } | null) => {
    const n = repo?.stargazers_count ?? 0;
    if (n < 1) return;
    const text = n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
    document.querySelectorAll("[data-stars]").forEach((el) => (el.textContent = "★ " + text));
  })
  .catch(() => undefined);

/** Play a player only while it is on screen (keeps the page light). */
function playWhenVisible(el: Element, player: Player, wants: () => boolean) {
  new IntersectionObserver(
    ([e]) => {
      if (e.isIntersecting && wants()) player.play();
      else if (!e.isIntersecting) player.pause();
    },
    { threshold: 0.25 },
  ).observe(el);
}

// ---------- hero: a video you can edit, rendering live ----------
const ACCENTS = ["#fafafa", "#a78bfa", "#22d3ee", "#a3e635", "#fb923c", "#f472b6"];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function heroProject(headline: string, accent: string, format: Format): Project {
  const intro = {
    html: `<div class="wrap"><div class="mark"><i></i></div><h1 class="r" style="animation-delay:.15s">${esc(headline) || "&#160;"}</h1><p class="r" style="animation-delay:.45s">Rendered live in your browser.</p></div>`,
    css: `.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center;padding:0 90px;background:radial-gradient(60% 55% at 50% 38%,color-mix(in srgb,var(--primary) 16%,transparent),transparent 70%)}
      h1{font:500 118px/1.04 Inter;letter-spacing:-.045em;margin:0;max-width:1500px;text-wrap:balance}
      p{font:400 40px Inter;color:#8f8f94;margin:0;letter-spacing:-.01em}
      .r{animation:r 1s cubic-bezier(.2,.8,.2,1) both}@keyframes r{from{opacity:0;transform:translateY(56px);filter:blur(16px)}}
      .mark{width:120px;height:120px;border-radius:50%;background:var(--primary);display:grid;place-items:center;animation:pop .8s cubic-bezier(.3,1.5,.4,1) both}
      .mark i{width:44px;height:50px;margin-left:12px;background:var(--background);clip-path:polygon(0 0,100% 50%,0 100%)}
      @keyframes pop{from{transform:scale(0) rotate(-90deg)}}`,
  };
  const blocks = ["title-reveal", "ui-mockup", "cursor-click", "feature-grid", "stats-counter", "pricing-card", "testimonial", "logo-outro", "html"];
  const grid = {
    fonts: ["https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&display=swap"],
    html: `<div class="g"><h2 class="r">Blocks, HTML <span>and Tailwind.</span></h2><div class="tiles">${blocks
      .map((b, i) => `<div class="t${b === "html" ? " on" : ""}" style="animation-delay:${(0.35 + i * 0.07).toFixed(2)}s">${b}</div>`)
      .join("")}</div></div>`,
    css: `.g{height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:56px;padding:0 100px}
      h2{font:500 86px/1.1 Inter;letter-spacing:-.04em;margin:0;text-align:center}h2 span{color:#6b6b70}
      .tiles{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;max-width:1400px}
      .t{font:500 34px 'Geist Mono',ui-monospace,monospace;padding:20px 30px;border:2px solid #2a2a2e;border-radius:999px;color:#d4d4d8;animation:t .6s cubic-bezier(.2,.8,.2,1) both}
      .t.on{background:var(--primary);border-color:var(--primary);color:var(--background)}
      .r{animation:r .9s cubic-bezier(.2,.8,.2,1) both}@keyframes r{from{opacity:0;transform:translateY(40px)}}
      @keyframes t{from{opacity:0;transform:translateY(30px) scale(.9)}}`,
  };
  const scenes: Project["scenes"] = [
    { id: "s1", block: "html", duration: 3.6, props: intro },
    { id: "s2", block: "ui-mockup", duration: 3.6, props: { asset: "shot", frame: format === "9:16" ? "phone" : "browser", motion: "tilt", url: "app.clipframe.dev" }, transition: { type: "slide", duration: 0.5 } },
    { id: "s3", block: "html", duration: 4, props: grid, transition: { type: "fade", duration: 0.5 } },
    {
      id: "s4",
      block: "stats-counter",
      duration: 3.4,
      props: { items: [{ value: 0, prefix: "$", suffix: "", label: "License fees" }, { value: 20, prefix: "", suffix: "", label: "Blocks" }, { value: 100, prefix: "", suffix: "%", label: "In your browser" }] },
      transition: { type: "zoom", duration: 0.5 },
    },
    { id: "s5", block: "logo-outro", duration: 3, props: { brand: "Clipframe", text: "github.com/ferdousmikdad/clipframe", cta: "Free forever" }, transition: { type: "fade", duration: 0.5 } },
  ];
  const total = scenes.reduce((s, x) => s + x.duration, 0);
  return {
    version: 1,
    meta: { name: "clipframe-hero", format, fps: 30, resolution: "1080p" },
    theme: { primary: accent, secondary: "#a3a3a6", background: "#0a0a0b", text: "#fafafa", font: "Inter", radius: 18 },
    assets: [{ id: "shot", type: "image", file: "assets/dashboard.svg" }],
    scenes,
    overlays: [{ id: "o1", block: "html-overlay", start: 0, end: total, props: { html: '<div class="bar"></div>', css: ".bar{position:absolute;left:0;bottom:0;height:6px;width:calc(var(--p) * 100%);background:var(--primary);opacity:.85}" } }],
  };
}

(function hero() {
  const stage = $("#hero-stage");
  const playBtn = $<HTMLButtonElement>("#hero-play");
  const icon = $("#hero-play-icon");
  const scrub = $<HTMLInputElement>("#hero-scrub");
  const time = $("#hero-time");
  const input = $<HTMLInputElement>("#hero-headline");
  const swatches = $("#hero-swatches");
  const status = $("#hero-status");
  const meter = $("#hero-meter");
  const exportBtn = $<HTMLButtonElement>("#hero-export");
  const resolveAsset = assetsFrom(new URL("examples/html-css/", location.href).href);

  let accent = ACCENTS[0];
  let format: Format = "16:9";
  let userPaused = false;
  let project = heroProject(input.value, accent, format);
  const player = createPlayer(stage, { project, resolveAsset, fontsUrl, controls: false, loop: true, autoPlay: true });

  const setIcon = () => {
    icon.setAttribute("d", player.playing ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5l11 7-11 7z");
    playBtn.setAttribute("aria-label", player.playing ? "Pause" : "Play");
  };
  player.on("play", setIcon);
  player.on("pause", setIcon);
  player.on("ready", setIcon);
  player.on("timeupdate", (t) => {
    scrub.max = String(player.duration);
    scrub.value = String(t);
    time.textContent = `${fmt(t)} / ${fmt(player.duration)}`;
  });
  playBtn.addEventListener("click", () => {
    userPaused = player.playing;
    player.toggle();
  });
  scrub.addEventListener("input", () => player.seek(Number(scrub.value)));
  playWhenVisible(stage, player, () => !userPaused);

  const update = () => {
    project = heroProject(input.value, accent, format);
    player.setProject(project);
  };
  let timer = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      update();
      if (!player.playing) player.seek(1.6); // show the headline while editing
    }, 120);
  });

  for (const c of ACCENTS) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "swatch", title: c });
    b.style.background = c;
    b.setAttribute("aria-label", `Accent ${c}`);
    b.setAttribute("aria-pressed", String(c === accent));
    b.addEventListener("click", () => {
      accent = c;
      swatches.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      update();
    });
    swatches.appendChild(b);
  }
  document.querySelectorAll<HTMLButtonElement>("#hero-format button").forEach((b) =>
    b.addEventListener("click", () => {
      format = b.dataset.format as Format;
      document.querySelectorAll("#hero-format button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      update();
    }),
  );

  exportBtn.addEventListener("click", async () => {
    if (!exportSupported()) {
      status.textContent = "Exporting needs Chrome or Edge (WebCodecs). Preview works everywhere.";
      return;
    }
    exportBtn.disabled = true;
    userPaused = true;
    player.pause();
    const t0 = performance.now();
    try {
      const blob = await renderToMp4(project, {
        resolution: "720p",
        resolveAsset,
        fontsUrl,
        onProgress: (p) => {
          const f = p.stage === "video" ? p.frame / p.total : p.stage === "finishing" ? 1 : 0;
          meter.style.width = `${Math.round(f * 100)}%`;
          status.textContent = p.stage === "video" ? `Rendering frame ${p.frame} of ${p.total}…` : "Preparing…";
        },
      });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob!), download: "clipframe.mp4", textContent: `Download clipframe.mp4` });
      status.replaceChildren(a, document.createTextNode(` · ${(blob!.size / 1e6).toFixed(1)} MB in ${secs}s, on this device`));
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      exportBtn.disabled = false;
    }
  });
})();

// ---------- showcase: the examples, rendering live ----------
type Example = { name: string; blocks: string[] };
const SHOWCASE: { name: string; title: string; text: string; tall?: boolean }[] = [
  { name: "taskflow-promo", title: "SaaS promo", text: "Title, UI mockup, cursor clicks, stats and an outro. 16:9." },
  { name: "orbit-reel", title: "Social reel", text: "A 9:16 reel with captions, before/after and pricing.", tall: true },
  { name: "html-css", title: "HTML and Tailwind", text: "Keyframes, a CSS chart, 3D screenshot and a code block." },
  { name: "bangla-launch", title: "Bangla launch", text: "Complex scripts shaped correctly, in a 1:1 post." },
];

async function registryFor(ex: Example | undefined, base: string): Promise<BlockRegistry> {
  const registry = createBuiltinRegistry();
  for (const file of ex?.blocks ?? []) {
    const mod = (await import(/* @vite-ignore */ base + file)) as { default: unknown };
    for (const b of resolvePluginExport(mod.default, file)) registry.add(b);
  }
  return registry;
}

(async function showcase() {
  const grid = $("#show-grid");
  const list = (await (await fetch("examples/index.json")).json()) as Example[];
  for (const s of SHOWCASE) {
    const base = new URL(`examples/${s.name}/`, location.href).href;
    const card = document.createElement("article");
    card.className = "show";
    card.innerHTML = `<div class="art compact ${["", "v2", "v3", "v4"][SHOWCASE.indexOf(s)]}"><div class="screen${s.tall ? " tall" : ""}"></div></div>
      <h3>${s.title}</h3><p>${s.text}</p>
      <a class="more-link" href="./playground.html?example=${s.name}">Open in the playground <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>`;
    grid.appendChild(card);
    const [project, registry] = await Promise.all([fetch(base + "project.json").then((r) => r.json() as Promise<Project>), registryFor(list.find((e) => e.name === s.name), base)]);
    if (projectDuration(project) <= 0) continue;
    const player = createPlayer(card.querySelector(".screen")!, { project, registry, resolveAsset: assetsFrom(base), fontsUrl, controls: false, loop: true });
    playWhenVisible(card, player, () => true);
  }
})();
