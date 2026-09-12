// On-demand, top-frame extraction. Never reads settings or sends network requests.
(() => {
  if (document.contentType === "application/pdf") return { status: "unsupported-pdf" };
  const normalize = (text) => text?.replace(/\s+/g, " ").trim() || null;
  const meta = (name) => normalize(document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.content);
  const limit = (text, size) => text?.slice(0, size) || null;
  const heading = normalize(document.querySelector("h1")?.textContent);
  const doi = (meta("citation_doi") || meta("DC.Identifier") || "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  const arxiv = (location.hostname === "arxiv.org" || location.hostname.endsWith(".arxiv.org")) && /\/(?:abs|html)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/i.exec(location.pathname)?.[1];
  const capture = {
    status: "captured",
    capturedAt: new Date().toISOString(),
    heading: limit(heading, 500),
    pageMetadata: {
      title: limit(meta("citation_title") || meta("DC.Title") || meta("og:title") || normalize(document.title) || heading, 500),
      url: location.href,
      abstract: limit(meta("citation_abstract") || meta("DC.Description") || normalize(document.querySelector("blockquote.abstract, .ltx_abstract .ltx_p, section.abstract")?.innerText)?.replace(/^Abstract\s*:\s*/i, ""), 12000),
      doi: /^10\.\d{4,9}\/\S+$/i.test(doi) ? limit(doi, 500) : null,
      arxivId: arxiv || null,
      authors: [...document.querySelectorAll('meta[name="citation_author"]')].slice(0, 100).map(el => limit(normalize(el.content), 200)).filter(Boolean),
    },
    highlight: null,
    contexts: {},
    selectionError: null,
  };
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return capture;
  if (selection.rangeCount !== 1) {
    capture.selectionError = "Select a single continuous passage.";
    return capture;
  }
  const range = selection.getRangeAt(0);
  const element = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const editable = node => element(node)?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  if (editable(range.startContainer) || editable(range.endContainer)) {
    capture.selectionError = "Select text in the paper, outside an editable field.";
    return capture;
  }
  const highlight = normalize(selection.toString());
  if (!highlight) return capture;
  if (highlight.length > 8000) {
    capture.selectionError = "Select a shorter claim (at most 8,000 characters).";
    return capture;
  }
  capture.highlight = highlight;
  capture.contexts.highlight = { text: highlight, effectiveRange: "highlight", warning: null };
  const common = element(range.commonAncestorContainer);
  // arXiv abstract pages use a single blockquote instead of a <p>.
  // Do not treat a container spanning multiple real paragraphs as one paragraph.
  const abstractBlock = common?.closest("blockquote.abstract");
  const paragraph = common?.closest("p, .ltx_p") ||
    (abstractBlock && !abstractBlock.querySelector("p, .ltx_p") ? abstractBlock : null);
  for (const [name, ancestor] of [
    ["paragraph", paragraph],
    ["section", common?.closest("section") || common?.closest("div")],
  ]) {
    const text = normalize(ancestor?.innerText);
    let warning = null;
    if (!text || !text.includes(highlight)) warning = `No single ${name} contains the complete selection. Using highlight only.`;
    else if (text.length > 24000) warning = `The ${name} exceeds 24,000 characters. Using highlight only; select a smaller passage for more context.`;
    capture.contexts[name] = warning
      ? { text: highlight, effectiveRange: "highlight", warning }
      : { text, effectiveRange: name, warning: null };
  }
  return capture;
})();
