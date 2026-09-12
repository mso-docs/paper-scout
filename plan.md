# Paper Scout — Getting Started Plan

## 1. Research paper sites

List the sites Paper Scout should recognize/support for context and searching.

- [ ] arXiv (arxiv.org)
- [ ] Semantic Scholar (semanticscholar.org)
- [ ] PubMed / PubMed Central (pubmed.ncbi.nlm.nih.gov)
- [ ] Google Scholar (scholar.google.com)
- [ ] SSRN (ssrn.com)
- [ ] bioRxiv / medRxiv (biorxiv.org, medrxiv.org)
- [ ] ACL Anthology (aclanthology.org)
- [ ] IEEE Xplore (ieeexplore.ieee.org)
- [ ] ACM Digital Library (dl.acm.org)
- [ ] Springer / Nature (link.springer.com, nature.com)
- [ ] ScienceDirect (sciencedirect.com)
- [ ] OpenReview (openreview.net)
- [ ] Trim list down to MVP launch targets (pick 2-3 to support first)

## 2. Mission statement

Nail down what Paper Scout actually is/does, beyond the README draft.

- [ ] Review current README MVP description as a starting draft
- [ ] Define target user (e.g., researchers, students, journalists fact-checking papers)
- [ ] Define the core problem being solved (verifying claims without leaving the paper)
- [ ] Write a 1-2 sentence mission statement
- [ ] Confirm scope boundaries (what Paper Scout explicitly does NOT do for MVP)
- [ ] Update README.md with finalized mission statement

## 3. Chrome extension bare bones

Stand up a minimal working extension as a technical foundation.

- [ ] Create `extension/` directory with `manifest.json` (Manifest V3)
- [ ] Add basic extension icon(s) and metadata (name, description, version)
- [ ] Implement content script to scrape the current page
- [ ] Content script grabs the page's `<h1>` tag text
- [ ] Wire up a way to trigger the scrape (toolbar button click or popup)
- [ ] Return/display the scraped `<h1>` text (popup UI or console log for now)
- [ ] Load extension unpacked in Chrome and verify it works on a real page
- [ ] Document how to load/run the extension locally in README
