# Overview

This is a portfolio site for a higly skilled yet novice AI Engineer.  The purpose is to impress employers with the sills of the Engineer.  As such, the site should be polished and professional.

The site will be hosted, at least initally, on GitHub Pages.  Thus it will be a static site and any advanced functionality will have to be implemented in the browser.

The site will have a few main areas and features:
1. a landing page with a small introduction and links to the projects, and a list of projects with small descriptions of the projects and links to subpages where the projects will be displayed
2. the project pages, which will contain writeups and reports, and to the extent possible playgrounds, communicating the work to readers
3. FUTURE: Mushy Mushbot, a mushroom-themed "AI assistant" that will "sell" the Engineer to potential employers

# Look and feel

The site should use a dark theme and be clean and modern, such as by using sans serif fonts.  Spacing should give an easy feel without being too sparse, and there should be appealing yet subdued visual variety of elements.  For example, many undifferentiated unindented lines jammed next to each other, presenting a block of text, is not accptable.  Indentation, spacing, horizontal dividers, or even images should be used to prevent bad design.  Innovation is better than ugliness.

FUTURE: a mushroom-oriented theme to complement the AI assistant

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

The chatbot Svelte component should be in the root layout with client:load and transition:persist="chatbot"; session ID and (future) chat history in sessionStorage.  It will be served by a Lambda behind API Gateway and Clouflare Turnstile, probably.  The Lambda will then coordinate communication with an LLM API.

Project display is the complicated part.  It will ideally 

---
Stack

Site: Astro (static), @astrojs/svelte, View Transitions via ClientRouter
Chatbot: Svelte component in root layout with client:load and transition:persist="chatbot"; session ID and (future) chat history in sessionStorage

Backend (not wired yet): Lambda + API Gateway + Cloudflare Turnstile + LLM (e.g. Gemini)

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