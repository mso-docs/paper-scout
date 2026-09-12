// Invoked only when a chat question is submitted. Reads visible HTML text.
(() => {
  if (document.contentType === 'application/pdf') return { error: 'PDFs are not supported. Open the HTML paper.' };
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  if (!root) return { error: 'No readable paper content found.' };
  // Clone and remove site controls without changing the page or reading form values.
  const clone = root.cloneNode(true);
  const originals = [...root.querySelectorAll('*')];
  const copies = [...clone.querySelectorAll('*')];
  originals.forEach((el, index) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') copies[index].remove();
  });
  clone.querySelectorAll('script, style, noscript, nav, header, footer, aside, form, input, textarea, select, button, [hidden], [aria-hidden="true"], [contenteditable]').forEach(el => el.remove());
  clone.querySelectorAll('p, div, section, li, h1, h2, h3, h4, h5, h6, br, tr').forEach(el => el.append(document.createTextNode(' ')));
  const pageContent = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  if (!pageContent) return { error: 'No readable paper content found.' };
  if (pageContent.length > 200000) return { error: 'This page exceeds the 200,000-character chat limit. Open a shorter HTML version. Paper text was not sent or truncated.' };
  return { pageContent, url: location.href };
})();
