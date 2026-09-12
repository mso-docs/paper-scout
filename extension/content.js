// Executed on demand in the top frame's isolated world. The final expression
// becomes executeScript's result; keep this independent of the popup UI.
(() => {
  if (document.contentType === "application/pdf") {
    return { status: "unsupported-pdf" };
  }

  const normalize = (text) => text?.replace(/\s+/g, " ").trim() || null;
  return {
    status: "captured",
    heading: normalize(document.querySelector("h1")?.textContent),
    pageMetadata: {
      title: normalize(document.title),
      url: location.href,
    },
  };
})();
