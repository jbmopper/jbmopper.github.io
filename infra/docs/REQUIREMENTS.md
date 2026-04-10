# Overview

This is a portfolio site for a higly skilled yet novice AI Engineer.  The purpose is to impress employers with the sills of the Engineer.  As such, the site should be polished and professional.

The site will be hosted, at least initally, on GitHub Pages.  Thus it will be a static site and any advanced functionality will have to be implemented in the browser.

The site will have a few main areas and features:
1. a landing page with a small introduction and links to the projects, and a list of projects with small descriptions of the projects and links to subpages where the projects will be displayed
2. the project pages, which will contain writeups and reports, and to the extent possible playgrounds, communicating the work to readers
3. Jay, an AI assistant backed by Vertex AI RAG that answers questions about Julius's projects and experience

# Look and feel

The site should use a dark theme and be clean and modern, such as by using sans serif fonts.  Spacing should give an easy feel without being too sparse, and there should be appealing yet subdued visual variety of elements.  For example, many undifferentiated unindented lines jammed next to each other, presenting a block of text, is not accptable.  Indentation, spacing, horizontal dividers, or even images should be used to prevent bad design.  Innovation is better than ugliness.

The site theme is dark and modern; the chatbot UI is consistent with the overall design

All elements in the site should be consistent.  All text should be visible against the background.  Any elements or libraries should display in a way consistent with the rest of the site.

# Pages

## Landing page

As mentioned above, the landing page will contain a small introduction and links to the projects, and a list of projects with small descriptions of the projects and links to subpages where the projects will be displayed.

The title of the landing page should be the domain name, currently "jbmopper.github.io", along with a subtitle "Portfolio Site".  

Beneat this, there should be 3 links arranged horizontally: Welcome, Projects, and Contact.  The Welcome link should go to the introduction, the Projects link should go to the projects list (both on the landing page), and the Contact link should go to `https://linkedin.com/in/jbmopper`.

The section below this should contain the introduction under the heading "Welcome".  If text is not supplied for the introduction, placeholder text should be added.

Beneath the introduction is the list of projects.  The project name should be a link to the site page containing the project report.  Beneath the project name should be the description text of the project.  The project currently being written up for this site is called "Deep Learning Fundamentals".  The description is "Fundamentals of deep learning, including transformer implementation in Pytorch, training and inference, performance analysis, hyperparmeter tuning, architectural variations (ablations)."  Other projects will be added in the future.

The footer at the page should contain a basic copyright with the year and the domain name as the holder.

## Project Pages

Each project will have a root page.  It is expected that most projects will have other pages the root page links to.  See below for additional details on project page integraion.

# Stack

The site overall will be a static site built using Astro.  It is expected that we will use Svelte for the chatbot, although that is part of the future phase, we want the site to be forward-compatible with this change.  

The Jay chatbot Svelte component is in the root layout with client:idle and transition:persist="chatbot"; session ID in localStorage, UI state in sessionStorage.  The backend is a Cloud Run service (~/Dev/jay) backed by Vertex AI RAG + Gemini, proxied through API Gateway with WAF rate limiting.

Project display is the complicated part.  It will ideally 

---
Stack

Site: Astro (static), @astrojs/svelte, View Transitions via ClientRouter
Chatbot: Jay — Svelte component in root layout with client:idle and transition:persist="chatbot"; session ID in localStorage, UI state in sessionStorage

Backend: Cloud Run (jay-chatbot, us-west1) → Vertex AI RAG + Gemini 3 Flash; proxied through API Gateway + WAF

--- 

A fixed container won’t share in-memory state across Astro and Observable pages (or across reloads). You need persisted/session identity.
Best pattern:
- Client conversation key in localStorage (or cookie) like conversationId.
- Widget boot on any page:
    - read existing conversationId
    - if missing, call backend to create one
    - resume conversation from backend using that id
- Backend (Lambda/API) stores conversation state keyed by conversationId (and optionally user/session id).
- Optional tab-level behavior: use sessionStorage for ephemeral UI state (open/closed, draft text), while keeping conversation history server-side.
So yes:
- localStorage/cookie = continuity across contexts/pages
- Lambda/backend = authoritative state + multi-turn memory
Minimal safeguards:
- Sign or validate conversation IDs (don’t trust arbitrary client IDs).
- Add TTL/cleanup and rate limits.
- If auth exists, bind conversation to user id; if anonymous, treat as untrusted and scoped.

# Security Requirements

Documenting security in this file is not itself a security risk if we keep it at the requirements and control level. Do not include secrets, account identifiers, private endpoints, token values, or exact detection thresholds.

## Security Architecture (Required)

- Public frontend remains static and is served without embedded secrets.
- Protected backend features run behind API Gateway and AWS WAF.
- Human verification is required with Cloudflare Turnstile for sensitive/expensive actions (resume generation, chatbot turns, inference requests).
- GPU inference may be proxied to an external provider, but requests must still pass project-controlled validation and abuse controls first.

## Implementation Controls (Required)

- Validate Turnstile token server-side before processing protected requests.
- Apply simple WAF managed protection and rate-based rule at API Gateway.
- Enforce strict request schemas, payload size limits, and content-type checks in Lambda handlers.
- Use signed or server-issued conversation IDs; do not trust arbitrary client-provided IDs.
- Configure CORS to explicit origins and allowed methods/headers only.
- Use least-privilege IAM per function and per environment.
- Keep secrets in AWS Secrets Manager or SSM Parameter Store; never commit secrets to git.
- Apply short timeouts and bounded retries for upstream calls.

## Operations and Delivery Practices

- Infrastructure changes are made through Terraform and reviewed in pull requests.
- CI runs test and plan checks before apply.
- Production apply is controlled (manual approval and AWS SSO-based operator access).
- Security-relevant logs are enabled for API Gateway and Lambda with request correlation IDs.
- Add alarms for elevated 4xx/5xx rates, Lambda errors, and anomalous request volume.
- Rotate secrets and API keys on a defined cadence and on incident trigger.

## Documentation Boundaries

Safe to include here:
- Which controls exist and why.
- High-level architecture and trust boundaries.
- Required operational practices and verification gates.

Do not include here:
- Secrets, keys, tokens, account IDs, or internal hostnames.
- Full WAF rule tuning values that could help evasion.
- Incident-specific forensic details or exploit reproduction steps.

# Graphics Prompts

```
abstract neural network architecture visualization, layered transformer
blocks, glowing teal data flow on dark navy background, minimal technical
diagram style, flat design asset, no text --ar 3:2 --style raw --s 50
```

```
the sensation of understanding arriving in layers, each stratum sharper than the last, crystalline geometries resolving from noise, warm-cool sylvan hues  against deep void, minimal technical diagram style, flat design asset, no text --ar 3:2 --style raw --s 50
```
```
abstract envisioning of genius, rendered as shape, texture, and color. Warm-cool sylvan hues dissolve into a jagged latticework of piercing neon beams. Surfaces appear smooth but are actually covered in an amazingly fine and uniform fur.
```
```
raw material transmuting into form, rough edges flowing into clean planes, the moment chaos becomes structure, sylvan and warm amber tones solidifying into cool graphite, minimal technical diagram crossed with brutalist style, flat design asset, no text --ar 3:2 --style raw --s 50
```