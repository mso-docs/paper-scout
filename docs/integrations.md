# Paper Scout Integrations

## Overview

Paper Scout uses multiple research providers behind a common integration
layer. The goal is to avoid dependence on a single scholarly index while
keeping the agent's search behavior predictable and research-focused.

For the MVP, Paper Scout integrates with:

-----------------------------------------------------------------------

  Integration             Authentication          Primary Purpose

----------------------- ----------------------- -----------------------

  Semantic Scholar        No API key for          Scholarly search, paper
                          supported public        metadata,
                          endpoints               citation/reference data

  OpenAlex                API key                 Broad scholarly search
                                                  and metadata

  Hugging Face Papers     API token               AI/ML-focused paper
                                                  discovery

  arXiv                   No API key              Preprint discovery and
                                                  metadata

  DuckDuckGo Search       Python package          Supplemental web
                                                  discovery and fallback

  LLM Provider            API key/provider        Claim analysis, query
                          dependent               generation, evidence

                                                  evaluation, synthesis
  -----------------------------------------------------------------------

All external calls should be made by the Paper Scout backend. Secrets
must never be embedded in the browser extension.

------------------------------------------------------------------------

# Integration Architecture

``` text
Browser Extension
       ↓
Paper Scout Backend
       ↓
Research Search Layer
       │
       ├── Semantic Scholar
       ├── OpenAlex
       ├── Hugging Face Papers
       ├── arXiv
       └── DuckDuckGo
       ↓
Result Normalization
       ↓
Deduplication / Ranking
       ↓
Evidence Evaluation
       ↓
Structured Response
       ↓
Browser Extension
```

The agent should interact with a common search interface rather than
provider-specific implementations.

Conceptually:

``` python
search_papers(query, providers=None)
get_paper(identifier, provider=None)
search_web(query)
```

------------------------------------------------------------------------

# Normalized Paper Model

Provider responses should be converted into a common internal
representation before the agent evaluates them.

Example:

``` python
{
    "title": "...",
    "authors": ["...", "..."],
    "abstract": "...",
    "year": 2026,
    "doi": "...",
    "arxiv_id": "...",
    "url": "...",
    "full_text_url": "...",
    "citation_count": 0,
    "source": "openalex",
    "provider_id": "..."
}
```

Fields may be `null` when a provider does not supply them.

The agent should reason over normalized results rather than raw provider
payloads.

------------------------------------------------------------------------

# 1. Semantic Scholar

## Purpose

Semantic Scholar is a primary scholarly discovery source for Paper
Scout.

Use it for:

-   paper search
-   titles and abstracts
-   author metadata
-   publication year
-   citation counts
-   references
-   citing papers
-   canonical paper URLs/identifiers when available

## Authentication

The MVP uses supported public Semantic Scholar endpoints without an API
key.

No Semantic Scholar secret should therefore be required in the default
MVP environment.

## Paper Scout Usage

Semantic Scholar is useful for:

``` text
claim
  ↓
generated scholarly query
  ↓
Semantic Scholar search
  ↓
candidate papers
  ↓
normalized Paper Scout records
```

Citation and reference relationships can later support deeper
investigation, but they are not required for the initial MVP.

## Failure Handling

Unauthenticated access may be rate limited.

If Semantic Scholar is unavailable or rate limited:

``` text
Semantic Scholar fails
        ↓
Continue investigation
        ↓
OpenAlex / arXiv / Hugging Face Papers
```

A Semantic Scholar failure should not terminate the entire Claim
Investigator workflow.

------------------------------------------------------------------------

# 2. OpenAlex

## Purpose

OpenAlex provides broad scholarly coverage and acts as a major source
for paper discovery and metadata.

Use it for:

-   scholarly work search
-   titles and abstracts when available
-   authors
-   publication dates
-   DOI and other identifiers
-   citation metadata
-   related scholarly works
-   open-access information when available

## Authentication

Paper Scout stores the OpenAlex credential on the backend.

Example:

``` text
OPENALEX_API_KEY=
```

Never expose this value to browser-side JavaScript.

## Paper Scout Usage

OpenAlex can operate alongside Semantic Scholar rather than merely as an
emergency fallback.

Results from both sources should be normalized and deduplicated before
evaluation.

------------------------------------------------------------------------

# 3. Hugging Face Papers

## Purpose

Hugging Face Papers adds an AI/ML-focused discovery source.

This is particularly useful when Paper Scout is investigating:

-   machine learning
-   large language models
-   AI safety
-   NLP
-   computer vision
-   model training
-   alignment
-   inference
-   related AI research

## Authentication

The Hugging Face token is stored on the backend.

Example:

``` text
HF_TOKEN=
```

Use the minimum permissions required for the integration.

Do not expose the token through the browser extension or commit it to
the repository.

## Paper Scout Usage

Hugging Face Papers should supplement broader scholarly indexes.

For AI/ML claims, the search layer may include Hugging Face
automatically:

``` text
AI/ML claim
   ↓
Semantic Scholar
OpenAlex
arXiv
Hugging Face Papers
   ↓
combined candidates
```

For clearly unrelated domains, the backend may skip Hugging Face to
reduce unnecessary requests.

------------------------------------------------------------------------

# 4. arXiv

## Purpose

arXiv provides direct access to preprints and is especially valuable for
recent research.

Use it for:

-   preprint search
-   titles
-   abstracts
-   authors
-   publication/update dates
-   categories
-   arXiv identifiers
-   paper links

## Authentication

No API key is required for the MVP.

## Paper Scout Usage

arXiv is particularly useful for:

-   recent research
-   AI/ML/CS papers
-   physics
-   mathematics
-   statistics
-   other arXiv-covered disciplines

An arXiv ID should also be retained during normalization because it is
useful for deduplicating results returned by multiple providers.

Example:

``` text
Semantic Scholar result
DOI: ...
arXiv: 2609.xxxxx

arXiv result
arXiv: 2609.xxxxx

        ↓

one Paper Scout candidate
```

------------------------------------------------------------------------

# 5. DuckDuckGo Search

## Purpose

DuckDuckGo provides supplemental web discovery when scholarly APIs do
not return sufficient results or when useful context exists outside the
indexed scholarly sources.

Paper Scout accesses DuckDuckGo through the selected Python search
package rather than an official DuckDuckGo search API.

## Appropriate Uses

DuckDuckGo can help discover:

-   paper landing pages
-   author/project pages
-   research repositories
-   PDFs
-   conference pages
-   documentation
-   additional leads when scholarly search is sparse

## Evidence Rules

A web result is not automatically scholarly evidence.

``` text
DuckDuckGo result
       ↓
Identify destination
       ↓
Is this an actual research publication?
       ↓
YES → candidate evidence
NO  → supplemental context only
```

Blogs, news articles, social posts, and general webpages should not be
presented as equivalent to peer-reviewed research or identifiable
preprints.

## Fallback Behavior

DuckDuckGo should generally come after scholarly sources:

``` text
Scholarly search
       ↓
Enough relevant evidence?
   ↙             ↘
 YES             NO
  ↓               ↓
evaluate      DDG discovery
                  ↓
             evaluate leads
```

This keeps Claim Investigator research-focused while still allowing the
agent to recover when structured indexes are insufficient.

------------------------------------------------------------------------

# 6. LLM Provider

## Purpose

The LLM provides the reasoning layer of Paper Scout.

It is responsible for:

-   normalizing highlighted claims
-   identifying important entities and conditions
-   determining what could support a claim
-   determining what could contradict a claim
-   identifying possible qualifications/limitations
-   generating search queries
-   evaluating retrieved evidence
-   classifying evidence
-   synthesizing results
-   answering Chat with Paper questions

The LLM should not be treated as a source of scholarly evidence.

Its conclusions must be grounded in content retrieved by Paper Scout.

## Authentication

Store the provider credential on the backend.

Example:

``` text
LLM_API_KEY=
```

------------------------------------------------------------------------

# Search Orchestration

## Claim Investigator

A typical investigation should look like:

``` text
Highlighted claim
       ↓
Claim normalization
       ↓
Generate investigation intents
       │
       ├── Support
       ├── Contradict
       ├── Qualify
       └── Related
       ↓
Generate targeted queries
       ↓
Search scholarly providers
       ↓
Normalize results
       ↓
Deduplicate
       ↓
Rank candidates
       ↓
Evaluate evidence
       ↓
Need additional evidence?
   ↙                 ↘
 NO                  YES
 ↓                    ↓
return          targeted follow-up
results              search
                       ↓
                    evaluate
```

The agent may perform a follow-up search when the first results are
insufficient, but the MVP should cap iterations to prevent runaway
latency and API usage.

------------------------------------------------------------------------

# Provider Selection

The backend does not need to call every provider for every query.

Example routing logic:

``` text
AI / ML topic
→ Semantic Scholar + OpenAlex + arXiv + Hugging Face Papers

General scholarly topic
→ Semantic Scholar + OpenAlex + arXiv when relevant

Insufficient scholarly results
→ DuckDuckGo supplemental search
```

Provider selection should remain deterministic enough to debug during
the MVP.

------------------------------------------------------------------------

# Deduplication

The same paper will frequently appear through multiple integrations.

Deduplicate in approximately this order:

1.  DOI
2.  arXiv ID
3.  other canonical identifier
4.  normalized title + year

When duplicate records contain different metadata, Paper Scout can merge
useful fields into one canonical internal record.

Example:

``` text
OpenAlex
title + DOI + citation count

Semantic Scholar
title + DOI + abstract

        ↓ merge

Paper Scout record
title + DOI + citation count + abstract
```

------------------------------------------------------------------------

# Ranking

Candidate ranking should prioritize:

1.  semantic relevance to the exact claim
2.  directness of evidence
3.  availability of enough content to evaluate the paper
4.  publication relationship/context
5.  recency where relevant
6.  citation signals

Citation count should be a signal, not a proxy for truth or relevance.

------------------------------------------------------------------------

# Reliability and Failure Handling

External integrations should fail independently.

``` text
Provider A → success
Provider B → timeout
Provider C → success
Provider D → rate limited

             ↓

Continue with successful results
```

The backend should record provider errors for debugging and optionally
expose a lightweight status to the UI.

Do not present:

> No evidence exists.

when the actual state is:

> One or more research providers could not be searched.

------------------------------------------------------------------------

# Secrets and Environment Variables

Suggested `.env` structure:

``` text
# Research providers
OPENALEX_API_KEY=
HF_TOKEN=

# LLM
LLM_API_KEY=
```

Semantic Scholar and arXiv do not require secrets for the planned MVP
access.

DuckDuckGo search is accessed through the Python package.

The `.env` file must not be committed.

Suggested `.gitignore` entry:

``` text
.env
.env.*
!.env.example
```

An `.env.example` may document required variables without containing
credentials:

``` text
OPENALEX_API_KEY=
HF_TOKEN=
LLM_API_KEY=
```

------------------------------------------------------------------------

# MVP Integration Principles

1.  **Scholarly sources first.** General web search is supplemental.
2.  **Providers return candidates, not conclusions.**
3.  **Normalize before reasoning.** The agent should not depend on
    provider-specific response formats.
4.  **No single provider is critical.** Degraded search is preferable to
    total failure.
5.  **Deduplicate aggressively.** Researchers should not see the same
    paper four times.
6.  **Expose sources.** Every evidence claim should lead the researcher
    back to the underlying work.
7.  **Keep secrets server-side.**
8.  **Do not equate popularity with evidence quality.**
9.  **Do not use the LLM itself as evidence.**
10.  **Optimize the MVP for useful results and a reliable demo, not
     exhaustive literature coverage.**

------------------------------------------------------------------------

# MVP Integration Success Criterion

The integration layer succeeds when Paper Scout can take a generated
research query, search multiple approved sources, normalize and
deduplicate the results, survive an individual provider failure, and
return enough trustworthy source material for the agent to evaluate a
highlighted claim.