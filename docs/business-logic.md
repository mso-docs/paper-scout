# Paper Scout Business Logic

## Overview

Paper Scout is a browser-based research agent designed to help
researchers interrogate papers without leaving their reading workflow.

The MVP has two primary modes:

1.  **Claim Investigator** --- investigates a highlighted claim against
    external scholarly literature.
2.  **Chat with Paper** --- answers questions using the current paper as
    the primary source of truth.

The core product distinction is:

> **Chat with Paper explains what is inside the paper. Claim
> Investigator investigates what is outside the paper.**

------------------------------------------------------------------------

## Core User Flows

### Claim Investigator

**User flow**

``` text
Find paper
  ↓
Highlight claim
  ↓
Select "Investigate Claim"
  ↓
Paper Scout captures claim + local context
  ↓
Agent interprets the claim
  ↓
Agent generates research/search intents
  ↓
Restricted scholarly search
  ↓
Candidate papers are evaluated
  ↓
Evidence is classified
  ↓
Results are shown beside the paper
```

### Chat with Paper

**User flow**

``` text
Find paper
  ↓
Open Paper Scout
  ↓
Ask a question about the paper
  ↓
Agent retrieves relevant paper content
  ↓
Agent answers using the paper
```

Example questions:

-   What are the main findings?
-   Summarize this paper.
-   What methodology did the authors use?
-   What limitations do the authors identify?
-   Explain this section.
-   What evidence do the authors provide for their conclusion?

------------------------------------------------------------------------

# Claim Investigator Business Logic

## 1. Capture Browser Context

When the researcher highlights text, the browser extension captures:

-   highlighted text
-   surrounding paragraph/context
-   page title
-   current URL
-   available paper metadata
-   paper identifier when detectable, such as DOI or arXiv ID

The researcher should not need to manually copy the claim into another
application.

------------------------------------------------------------------------

## 2. Normalize the Claim

The agent converts the selected passage into a concise research claim.

Where applicable, extract:

``` text
Subject
Outcome / relationship
Direction
Population / domain
Conditions
Important terminology
```

Example:

``` text
Highlighted text:
"RLHF significantly reduces deceptive behavior across the tested models."

Normalized claim:
RLHF reduces deceptive behavior in language models.

Subject: RLHF
Outcome: deceptive behavior
Direction: reduces
Population: language models
```

If the selection does not contain a meaningful research claim, the agent
should say so rather than forcing an investigation.

------------------------------------------------------------------------

## 3. Generate Investigation Intents

Paper Scout should not simply search the highlighted sentence or
generate a grammatical opposite.

The agent asks:

1.  What evidence would **support** this claim?
2.  What evidence would **contradict** this claim?
3.  What evidence would **qualify or limit** this claim?
4.  What **related research** would help the researcher understand it?

These become separate search intents.

Example:

``` text
Claim:
RLHF reduces deceptive behavior in language models.

Support:
RLHF deception reduction language models

Contradiction:
RLHF deceptive behavior persists
RLHF increases or fails to reduce deception

Qualification:
RLHF deception limitations
RLHF deception model size conditions

Related:
alternative methods deceptive behavior language models
```

Counter-evidence is semantic, not just linguistic negation. A paper
showing that an effect disappears under a particular condition may
qualify the claim even if it never directly says the original claim is
false.

------------------------------------------------------------------------

## 4. Restricted Research Search

Paper Scout uses a controlled search layer rather than unrestricted
autonomous browsing as its primary research mechanism.

### MVP Integrations

See [`integrations.md`](integrations.md) for the current provider list,
authentication requirements, the normalized paper structure, and the
common search interface (`search_papers`, `get_paper`, `search_web`).
That file is the source of truth for integration/API/tech-stack details;
this section only covers how those providers are used in the business
logic below.

### Search Priority

For research evidence, prefer scholarly sources first, falling back to
DuckDuckGo only when scholarly results are insufficient (see
`integrations.md` → Provider Selection / Fallback Behavior for the exact
routing logic).

DuckDuckGo results should not automatically be treated as scholarly
evidence. They can help discover relevant papers, project pages,
repositories, or other useful context, but evidence classification
should favor identifiable research publications.

------------------------------------------------------------------------

## 5. Search Strategy

For each claim, the agent may generate multiple queries.

``` text
normalized claim
      ↓
┌───────────────────────┐
│ support query         │
│ contradiction query   │
│ qualification query   │
│ related-work query    │
└───────────────────────┘
      ↓
research providers
      ↓
deduplicated candidates
```

The MVP should keep the number of queries and results intentionally
small to control latency and make the investigation understandable.

Suggested initial behavior:

-   1--2 queries per investigation category
-   retrieve a small number of candidates per query
-   deduplicate by DOI, arXiv ID, normalized title, or provider
    identifier
-   rank candidates before asking the model to deeply evaluate them

------------------------------------------------------------------------

## 6. Evaluate Candidate Evidence

Search results are candidates, not conclusions.

Paper Scout evaluates whether each candidate actually bears on the
highlighted claim.

### Evaluation Rules

1.  Relevance to the exact claim comes first.
2.  Prefer primary research when available.
3.  Do not classify evidence from a title alone.
4.  Use abstracts, available paper text, and metadata to determine
    relevance.
5.  Citation count may be a ranking signal but must not dominate
    relevance.
6.  Recent papers should not be discarded simply because they have few
    citations.
7.  Deliberately look for disagreement and limitations.
8.  Distinguish direct contradiction from qualification.
9.  Never fabricate papers, citations, findings, or links.
10.  If evidence is insufficient, say so.

------------------------------------------------------------------------

## 7. Evidence Classification

Useful results are classified as:

### Supports

Evidence directly consistent with the highlighted claim.

### Contradicts

Evidence that directly challenges the claim or provides a conflicting
result.

### Qualifies

Evidence suggesting the claim is only true under narrower conditions,
depends on an important variable, has methodological limitations, or
requires additional context.

### Related

Research that does not directly test the claim but provides useful
adjacent evidence, alternative methods, background, or follow-up work.

### Insufficient Evidence

Used when Paper Scout cannot retrieve enough evidence to make a
responsible classification.

------------------------------------------------------------------------

## 8. Return Results

The researcher should receive a concise investigation rather than a raw
search-results page.

Example structure:

``` text
Claim
"RLHF reduces deceptive behavior in language models."

SUPPORTS
Paper A
Why it matters: ...

QUALIFIES
Paper B
Why it matters: ...

CONTRADICTS
Paper C
Why it matters: ...

RELATED
Paper D
Why it matters: ...
```

Each result should include enough metadata for the researcher to
identify the paper and a link back to the source.

The interface should clearly distinguish:

-   what the original paper claims
-   what an external paper reports
-   Paper Scout's synthesis/classification

------------------------------------------------------------------------

# Chat with Paper Business Logic

## 1. Identify the Current Paper

Paper Scout uses browser context to determine which paper the researcher
is viewing.

Possible identifiers include:

-   URL
-   DOI
-   arXiv ID
-   page metadata
-   paper title

------------------------------------------------------------------------

## 2. Retrieve Paper Content

Paper Scout obtains usable text from the current paper.

Depending on the site and format, this may come from:

-   browser DOM
-   available HTML version
-   paper API/metadata source
-   accessible full text
-   extracted PDF text

The MVP should prefer the simplest reliable method for supported sites
rather than attempting universal PDF/site compatibility.

------------------------------------------------------------------------

## 3. Interpret the Question

The user asks a natural-language question about the current paper.

Examples:

``` text
Summarize this paper.
What are the main findings?
What limitations do the authors mention?
Explain the methodology.
What does this section mean?
What evidence supports their conclusion?
```

------------------------------------------------------------------------

## 4. Retrieve Relevant Paper Context

Paper Scout retrieves the portions of the paper relevant to the
question.

The agent should avoid using unrelated external research when operating
in Chat with Paper mode unless the researcher explicitly asks to broaden
the investigation.

------------------------------------------------------------------------

## 5. Generate a Grounded Answer

The answer should be based on the current paper.

If the requested information is not present, Paper Scout should say that
rather than infer an unsupported answer.

------------------------------------------------------------------------

# Browser vs. Agent Responsibilities

## Browser Extension

Responsible for:

-   detecting the current page
-   capturing highlighted text
-   capturing surrounding context
-   collecting URL/title/page metadata
-   triggering Claim Investigator
-   sending Chat with Paper questions
-   displaying results in the browser
-   linking researchers to discovered papers

## Agent / Backend

Responsible for:

-   claim extraction
-   claim normalization
-   generating investigation intents
-   generating search queries
-   calling research-provider adapters
-   deduplicating and ranking results
-   evaluating candidate evidence
-   classifying evidence
-   retrieving paper content
-   answering questions about the current paper
-   returning structured results to the extension

------------------------------------------------------------------------

# Provider Architecture

Paper Scout should isolate external integrations behind adapters, and a
provider failure should not necessarily fail the entire investigation
(e.g. continue with the remaining providers if one is rate limited or
times out). See [`integrations.md`](integrations.md) → Integration
Architecture and Reliability/Failure Handling for the adapter diagram and
the exact fallback behavior.

The response may indicate that one or more providers were unavailable.

------------------------------------------------------------------------

# Authentication and Secrets

API credentials must not be embedded in the browser extension. The
extension communicates with the Paper Scout backend, and the backend
communicates with authenticated providers. See
[`integrations.md`](integrations.md) → Secrets and Environment Variables
for which providers require a key and the required backend environment
variables.

------------------------------------------------------------------------

# MVP Scope

## Build

-   browser extension
-   highlight → Investigate Claim interaction
-   claim normalization
-   support/counter/qualification/related search generation
-   scholarly provider integrations
-   result normalization and deduplication
-   evidence evaluation/classification
-   source links
-   Chat with Paper
-   concise grounded answers

## Do Not Build Yet

-   user accounts
-   reference-manager integrations
-   citation graph visualization
-   complete systematic literature reviews
-   collaboration/workspaces
-   project management
-   complex personalization
-   unrestricted autonomous browsing
-   universal publisher/PDF compatibility
-   automated citation generation for manuscripts

------------------------------------------------------------------------

# MVP Success Criterion

The MVP succeeds if a researcher can:

1.  Open a supported research paper.
2.  Highlight a meaningful claim.
3.  Select **Investigate Claim**.
4.  Receive useful supporting, contradictory, qualifying, or related
    scholarly evidence.
5.  Open the underlying sources.
6.  Ask questions about the current paper without leaving the reading
    workflow.

The central experience should remain:

> **Read → Ask → Highlight → Investigate**

Paper Scout should reduce the context switching required to critically
read research without attempting to replace the researcher's judgment.