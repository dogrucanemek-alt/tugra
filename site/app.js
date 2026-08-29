const root = document.documentElement;
const btn = document.getElementById("theme");
const copy = document.getElementById("copy");
const cmd = document.getElementById("cmd");

function apply(theme) {
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

btn?.addEventListener("click", () => {
  const now = root.getAttribute("data-theme");
  const next = now === "ink" ? "paper" : now === "paper" ? null : "ink";
  apply(next);
});

copy?.addEventListener("click", async () => {
  const text = cmd?.textContent?.trim() ?? "npx tugra init";
  try {
    await navigator.clipboard.writeText(text);
    copy.textContent = "Copied";
  } catch {
    copy.textContent = "Select and copy";
  }
  setTimeout(() => {
    copy.textContent = "Copy";
  }, 1600);
});
