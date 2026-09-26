// Shared behaviour for every language page: theme toggle, language tabs,
// table-of-contents highlighting, and Mermaid rendering (re-rendered when the
// colour theme changes so diagrams always match the page).
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

const root = document.documentElement;
const THEME_KEY = "as-doc-theme";
const LANG_KEY = "as-doc-lang";

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the preference just isn't remembered.
  }
}

// ---------- theme ----------

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function isDark() {
  const forced = root.getAttribute("data-theme");
  if (forced) return forced === "dark";
  return darkQuery.matches;
}

const savedTheme = storageGet(THEME_KEY);
if (savedTheme === "light" || savedTheme === "dark") {
  root.setAttribute("data-theme", savedTheme);
}

const themeButton = document.querySelector(".theme-toggle");
function syncThemeButton() {
  if (!themeButton) return;
  themeButton.textContent = isDark() ? "☀" : "☾";
}
themeButton?.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  root.setAttribute("data-theme", next);
  storageSet(THEME_KEY, next);
  syncThemeButton();
  renderDiagrams();
});
darkQuery.addEventListener("change", () => {
  if (!root.getAttribute("data-theme")) {
    syncThemeButton();
    renderDiagrams();
  }
});
syncThemeButton();

// ---------- language tabs ----------

// Keep the reader's position when switching languages: both pages share the
// same section ids, so the current hash is carried over.
for (const link of document.querySelectorAll(".lang-tabs a")) {
  link.addEventListener("click", (event) => {
    storageSet(LANG_KEY, link.dataset.lang ?? "");
    if (link.getAttribute("aria-current") === "page") {
      event.preventDefault();
      return;
    }
    const base = link.getAttribute("href").split("#")[0];
    link.setAttribute("href", base + window.location.hash);
  });
}

// ---------- table of contents ----------

const tocToggle = document.querySelector(".toc-toggle");
tocToggle?.addEventListener("click", () => {
  document.body.classList.toggle("toc-open");
});
for (const link of document.querySelectorAll(".toc a")) {
  link.addEventListener("click", () => document.body.classList.remove("toc-open"));
}

const tocLinks = new Map();
for (const link of document.querySelectorAll(".toc a[href^='#']")) {
  tocLinks.set(link.getAttribute("href").slice(1), link);
}
const observed = [...document.querySelectorAll("main h2[id], main h3[id]")].filter(
  (el) => tocLinks.has(el.id),
);
if (observed.length > 0 && "IntersectionObserver" in window) {
  let current = null;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (current) current.classList.remove("active");
          current = tocLinks.get(entry.target.id);
          current?.classList.add("active");
        }
      }
    },
    { rootMargin: "-64px 0px -70% 0px" },
  );
  for (const el of observed) observer.observe(el);
}

// ---------- mermaid ----------

function cssVar(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function mermaidConfig() {
  const dark = isDark();
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: cssVar("--font-sans"),
    flowchart: { htmlLabels: true, curve: "basis" },
    sequence: { mirrorActors: false, showSequenceNumbers: false },
    themeVariables: dark
      ? {
          darkMode: true,
          background: "#1c1f23",
          primaryColor: "#1f2a3d",
          primaryBorderColor: "#7aa7ff",
          primaryTextColor: "#e6e8eb",
          secondaryColor: "#2a2333",
          tertiaryColor: "#23272d",
          lineColor: "#9aa4af",
          textColor: "#e6e8eb",
          clusterBkg: "#202429",
          clusterBorder: "#3a4048",
          noteBkgColor: "#2d2615",
          noteBorderColor: "#8a6d22",
          noteTextColor: "#e6e8eb",
          actorBkg: "#1f2a3d",
          actorBorder: "#7aa7ff",
          actorTextColor: "#e6e8eb",
          signalColor: "#c9d1d9",
          signalTextColor: "#e6e8eb",
          labelBoxBkgColor: "#23272d",
          labelTextColor: "#e6e8eb",
          loopTextColor: "#e6e8eb",
          activationBkgColor: "#2a3550",
          edgeLabelBackground: "#1c1f23",
          fontSize: "14px",
        }
      : {
          darkMode: false,
          background: "#ffffff",
          primaryColor: "#e6eefc",
          primaryBorderColor: "#2f6fdb",
          primaryTextColor: "#1f2328",
          secondaryColor: "#f4ecfb",
          tertiaryColor: "#f3f1ec",
          lineColor: "#59636e",
          textColor: "#1f2328",
          clusterBkg: "#faf9f6",
          clusterBorder: "#d6d2c8",
          noteBkgColor: "#fff6e0",
          noteBorderColor: "#e8c46a",
          noteTextColor: "#1f2328",
          actorBkg: "#e6eefc",
          actorBorder: "#2f6fdb",
          actorTextColor: "#1f2328",
          signalColor: "#1f2328",
          signalTextColor: "#1f2328",
          labelBoxBkgColor: "#f3f1ec",
          labelTextColor: "#1f2328",
          loopTextColor: "#1f2328",
          activationBkgColor: "#d5e3fb",
          edgeLabelBackground: "#ffffff",
          fontSize: "14px",
        },
  };
}

const diagrams = [...document.querySelectorAll("pre.mermaid")];
for (const el of diagrams) {
  // Keep the pristine source so the diagram can be re-rendered on theme change.
  el.dataset.src = el.textContent.trim();
}

let renderGeneration = 0;
async function renderDiagrams() {
  const generation = ++renderGeneration;
  mermaid.initialize(mermaidConfig());
  let index = 0;
  for (const el of diagrams) {
    index += 1;
    try {
      const { svg } = await mermaid.render(`mmd-${generation}-${index}`, el.dataset.src);
      if (generation !== renderGeneration) return;
      el.innerHTML = svg;
      el.dataset.processed = "true";
    } catch (err) {
      console.error("Mermaid render failed", err);
      el.textContent = el.dataset.src;
      el.dataset.processed = "true";
    }
  }
}

renderDiagrams();
