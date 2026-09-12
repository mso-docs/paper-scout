const captureButton = document.querySelector("#capture");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

captureButton.addEventListener("click", async () => {
  captureButton.disabled = true;
  result.hidden = true;
  status.dataset.error = "false";
  status.textContent = "Capturing page…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) {
      throw new Error("No active page found. Open a web page and try again.");
    }
    const url = new URL(tab.url || "chrome://newtab");
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Open an HTTP or HTTPS web page to capture its heading. Browser pages and local files aren't supported yet.");
    }
    if (/\.pdf$/i.test(url.pathname)) {
      throw new Error("PDF capture is coming later. Open the paper's HTML or abstract page to try heading capture.");
    }

    let capture;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      capture = results[0]?.result;
    } catch {
      throw new Error("Chrome couldn't read this page. Protected pages (including the Chrome Web Store) and the PDF viewer can't be captured. Try a regular HTML page; reload it if needed.");
    }
    if (capture?.status === "unsupported-pdf") {
      throw new Error("PDF capture is coming later. Open the paper's HTML or abstract page to try heading capture.");
    }
    if (capture?.status !== "captured" || !capture.pageMetadata) {
      throw new Error("The page returned no capture. Reload the page and try again.");
    }

    // Treat all captured page content as text, never HTML.
    document.querySelector("#heading").textContent = capture.heading || "No non-empty <h1> heading found.";
    document.querySelector("#page-title").textContent = capture.pageMetadata.title || "No page title found.";
    document.querySelector("#page-url").textContent = capture.pageMetadata.url;
    result.hidden = false;
    status.textContent = capture.heading ? "Page captured." : "Page captured, but its first heading is missing or empty.";
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message || "Capture failed. Please try again.";
  } finally {
    captureButton.disabled = false;
  }
});
