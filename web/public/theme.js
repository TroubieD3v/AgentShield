// Applies the saved theme before first paint (an external file, so the strict CSP stays free of inline scripts).
try {
  var t = localStorage.getItem("agentshield.theme");
  document.documentElement.classList.toggle("dark", t !== "light");
} catch (e) {
  document.documentElement.classList.add("dark");
}
