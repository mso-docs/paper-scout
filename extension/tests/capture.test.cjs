const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const content = readFileSync(`${__dirname}/../content.js`, "utf8");

function scrape({ heading = null, title = "Paper title", type = "text/html", highlight = "", paragraph = null, abstractBlock = null, abstractHasParagraphs = false, section = null, div = null, editable = false, metadata = {}, abstract = null, url = "https://example.org/paper" } = {}) {
  const common = { nodeType: 1, closest: selector => {
    if (selector === "p, .ltx_p") return paragraph === null ? null : { innerText: paragraph };
    if (selector === "blockquote.abstract") return abstractBlock === null ? null : { innerText: abstractBlock, querySelector: () => abstractHasParagraphs ? {} : null };
    if (selector === "section") return section === null ? null : { innerText: section };
    if (selector === "div") return div === null ? null : { innerText: div };
    return editable ? {} : null;
  } };
  const textNode = { nodeType: 3, parentElement: common };
  return JSON.parse(JSON.stringify(vm.runInNewContext(content, {
    Node: { ELEMENT_NODE: 1 },
    document: {
      contentType: type, title,
      querySelector: selector => selector === "h1" ? (heading === null ? null : { textContent: heading }) : { content: metadata[selector.match(/"([^"]+)"/)?.[1]], innerText: selector.startsWith("blockquote") ? abstract : undefined },
      querySelectorAll: () => [],
    },
    window: { getSelection: () => ({ rangeCount: 1, isCollapsed: !highlight, toString: () => highlight,
      getRangeAt: () => ({ startContainer: textNode, endContainer: textNode, commonAncestorContainer: textNode }) }) },
    location: new URL(url),
  })));
}

test("capture keeps first heading separate from paper metadata and validates identifiers", () => {
  const c = scrape({ heading: " Category\n name ", metadata: { citation_title: " Actual title ", citation_doi: "https://doi.org/10.1234/example" }, url: "https://arxiv.org/abs/1706.03762v2" });
  assert.equal(c.heading, "Category name"); assert.equal(c.pageMetadata.title, "Actual title");
  assert.equal(c.pageMetadata.doi, "10.1234/example"); assert.equal(c.pageMetadata.arxivId, "1706.03762v2");
  assert.equal(scrape({ url: "https://fakearxiv.org/abs/1706.03762" }).pageMetadata.arxivId, null);
});
test("missing heading does not block capture and empty selection is not a claim", () => {
  assert.equal(scrape().heading, null); assert.equal(scrape({ heading: " \n " }).heading, null);
  assert.equal(scrape().highlight, null);
});
test("nested selection captures paragraph and section from a single snapshot", () => {
  const c = scrape({ highlight: "This\n claim", paragraph: "Before. This claim. After.", section: "Section. Before. This claim. After. More." });
  assert.equal(c.highlight, "This claim"); assert.equal(c.contexts.paragraph.text, "Before. This claim. After.");
  assert.equal(c.contexts.section.effectiveRange, "section");
});
test("section falls back to a containing div; missing paragraph falls back visibly", () => {
  const c = scrape({ highlight: "Across paragraphs", div: "Context. Across paragraphs. More." });
  assert.equal(c.contexts.paragraph.effectiveRange, "highlight"); assert.match(c.contexts.paragraph.warning, /No single paragraph/);
  assert.equal(c.contexts.section.text, "Context. Across paragraphs. More.");
});
test("oversized containers and incomplete context never silently truncate the claim", () => {
  const c = scrape({ highlight: "Claim", paragraph: "Different text", section: `Claim${"x".repeat(24000)}` });
  assert.equal(c.contexts.paragraph.text, "Claim"); assert.equal(c.contexts.section.text, "Claim");
  assert.match(c.contexts.section.warning, /exceeds/);
});
test("editable fields, oversized selections, and PDFs are rejected", () => {
  assert.match(scrape({ highlight: "Private draft", editable: true }).selectionError, /editable/);
  assert.match(scrape({ highlight: "x".repeat(8001) }).selectionError, /shorter/);
  assert.equal(scrape({ highlight: "x".repeat(8001) }).highlight, null);
  assert.deepEqual(scrape({ type: "application/pdf" }), { status: "unsupported-pdf" });
});

test("abstract metadata excludes generic site descriptions and reads paper abstract DOM", () => {
  assert.equal(scrape({ metadata: { description: "Search millions of papers" } }).pageMetadata.abstract, null);
  assert.equal(scrape({ abstract: "Abstract:  Actual paper findings. " }).pageMetadata.abstract, "Actual paper findings.");
  assert.equal(scrape({ metadata: { citation_abstract: "Published abstract" }, abstract: "Other text" }).pageMetadata.abstract, "Published abstract");
});

test("arXiv abstract block is paragraph context unless it spans real paragraphs", () => {
  const c = scrape({ highlight: "the degradation reflects general image legibility", abstractBlock: "Earlier findings. the degradation reflects general image legibility rather than fine-grained discrimination failure. Later findings." });
  assert.equal(c.contexts.paragraph.effectiveRange, "paragraph");
  assert.equal(c.contexts.paragraph.warning, null);
  assert.match(c.contexts.paragraph.text, /Earlier findings/);
  assert.equal(scrape({ highlight: "Claim", abstractBlock: "Claim", abstractHasParagraphs: true }).contexts.paragraph.effectiveRange, "highlight");
  assert.match(scrape({ highlight: "Claim", abstractBlock: "Claim" + "x".repeat(24000) }).contexts.paragraph.warning, /exceeds/);
});
