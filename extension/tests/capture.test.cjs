const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const content = readFileSync(`${__dirname}/../content.js`, "utf8");
const popup = readFileSync(`${__dirname}/../popup.js`, "utf8");

function scrape({ heading = null, title = "Paper title", type = "text/html" } = {}) {
  return JSON.parse(JSON.stringify(vm.runInNewContext(content, {
    document: {
      contentType: type,
      title,
      querySelector: () => heading === null ? null : { textContent: heading },
    },
    location: { href: "https://example.org/paper" },
  })));
}

function popupHarness({ tab = { id: 1, url: "https://example.org/paper" }, capture = scrape({ heading: "A paper" }), reject = false } = {}) {
  const elements = Object.fromEntries(["capture", "status", "result", "heading", "page-title", "page-url"].map(id => [id, { dataset: {}, textContent: "", hidden: id === "result" }]));
  let click;
  let injections = 0;
  elements.capture.addEventListener = (_, callback) => { click = callback; };
  vm.runInNewContext(popup, {
    URL,
    document: { querySelector: selector => elements[selector.slice(1)] },
    chrome: {
      tabs: { query: async () => tab ? [tab] : [] },
      scripting: { executeScript: async () => {
        injections++;
        if (reject) throw new Error("Cannot access contents of url");
        return [{ result: capture }];
      } },
    },
  });
  return { elements, click, injections: () => injections };
}

test("capture normalizes heading whitespace and keeps title/URL separate", () => {
  assert.deepEqual(scrape({ heading: "  A\n paper   title ", title: " Site title " }), {
    status: "captured", heading: "A paper title",
    pageMetadata: { title: "Site title", url: "https://example.org/paper" },
  });
});

test("absent or empty headings remain absent instead of using document title", () => {
  assert.equal(scrape().heading, null);
  assert.equal(scrape({ heading: " \n " }).heading, null);
});

test("PDF documents return an explicit unsupported result", () => {
  assert.deepEqual(scrape({ type: "application/pdf" }), { status: "unsupported-pdf" });
});

test("popup displays captured text literally and releases the button", async () => {
  const h = popupHarness({ capture: scrape({ heading: '<img src=x onerror="alert(1)">' }) });
  const pending = h.click();
  assert.equal(h.elements.capture.disabled, true);
  await pending;
  assert.equal(h.elements.heading.textContent, '<img src=x onerror="alert(1)">');
  assert.equal(h.elements.result.hidden, false);
  assert.equal(h.elements.capture.disabled, false);
  await h.click();
  assert.equal(h.injections(), 2);
});

test("missing headings show a useful result with page metadata", async () => {
  const h = popupHarness({ capture: scrape() });
  await h.click();
  assert.match(h.elements.heading.textContent, /No non-empty/);
  assert.equal(h.elements["page-title"].textContent, "Paper title");
  assert.equal(h.elements.result.hidden, false);
});

test("blocked schemes, missing tabs, and PDF URLs are rejected before injection", async () => {
  for (const tab of [null, { id: 1, url: "chrome://extensions" }, { id: 1, url: "file:///paper.html" }, { id: 1, url: "https://example.org/paper.PDF?download=1" }]) {
    const h = popupHarness({ tab });
    await h.click();
    assert.equal(h.injections(), 0);
    assert.equal(h.elements.status.dataset.error, "true");
    assert.equal(h.elements.capture.disabled, false);
  }
});

test("injection failures, PDF viewer responses, and missing results hide stale output", async () => {
  for (const options of [{ reject: true }, { capture: { status: "unsupported-pdf" } }, { capture: null }]) {
    const h = popupHarness(options);
    h.elements.result.hidden = false;
    await h.click();
    assert.equal(h.elements.result.hidden, true);
    assert.equal(h.elements.status.dataset.error, "true");
    assert.equal(h.elements.capture.disabled, false);
  }
});
