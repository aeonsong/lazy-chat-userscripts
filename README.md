# Lazy Chat Userscripts

Two lightweight userscripts for long AI chats:

- **ChatGPT Lazy Chat++** — detach-based DOM virtualization, HARD PAUSE during streaming, lightweight TOC, search, pinned navigation, lazy heading index, and a low-contrast UI.
- **Gemini Lazy Chat++** — TOC-first navigation with conservative conditional detach only for longer chats, plus HARD PAUSE during generation.

These scripts were **vibe coded** for my own day-to-day use. ChatGPT is the primary target and Gemini is secondary. The goal is practical: keep long chats responsive and make older turns easy to navigate without constantly scanning or rendering the entire conversation.

## Install

Use a userscript manager such as Tampermonkey or another compatible userscript manager.

### ChatGPT Lazy Chat++

Raw install/source:

`https://raw.githubusercontent.com/aeonsong/lazy-chat-userscripts/main/chatgpt-lazy-chat.user.js`

Target:

`https://chatgpt.com/*`

Also matches the legacy `https://chat.openai.com/*` host.

### Gemini Lazy Chat++

Raw install/source:

`https://raw.githubusercontent.com/aeonsong/lazy-chat-userscripts/main/gemini-lazy-chat.user.js`

Target:

`https://gemini.google.com/*`

## Design notes

### ChatGPT version

The ChatGPT script keeps a small recent window connected to the DOM and detaches older turns. It maintains a lightweight in-memory TOC so older user turns can still be located without restoring the entire conversation. Lazy-chat DOM work is paused while ChatGPT is streaming.

It also contains a small `/translate` page layout patch and a normal-copy interception workaround used in my own ChatGPT workflow.

### Gemini version

The Gemini script is intentionally more conservative. The TOC is always available, while detach only activates after the currently loaded DOM reaches a threshold. This avoids needlessly fighting Gemini's own rendering lifecycle on shorter conversations.

## References and acknowledgements

This project builds on ideas from two public projects and credits them explicitly:

- [AlexSHamilton/chatgpt-lazy-chat-plusplus](https://github.com/AlexSHamilton/chatgpt-lazy-chat-plusplus) — the principal source and architectural reference for long-chat lazy rendering/detach behavior, HARD PAUSE during streaming, idle batching, and the original ChatGPT Lazy Chat++ approach. `chatgpt-lazy-chat.user.js` here is a modified and extended derivative and remains licensed under GPL-3.0-or-later, consistent with the upstream GPL-3.0 license.
- [lyw123www/GptToc](https://github.com/lyw123www/GptToc) — a design/UX reference for a question TOC, clickable navigation, and expandable answer sub-headings. Its extension code was not copied into these scripts; the repository is acknowledged for the interaction model and UX inspiration. At the time this README was prepared, that repository did not expose a `LICENSE` file.

The integrated implementation combines those ideas around one principle: **the TOC should understand the virtualization layer instead of running as a separate full-DOM scanner.**

The Gemini script is a vibe-coded adaptation informed by the same architecture and TOC ideas; it is not presented as an upstream Gemini port from either referenced project.

## Privacy and network behavior

The scripts do not intentionally make external network requests and do not include token estimation. They operate on the current page DOM and keep only small navigation metadata in memory/local browser storage where needed.

## Maintenance warning

ChatGPT and Gemini both change their web DOM frequently. Selectors can break. Treat these as practical personal tools rather than stable platform APIs.

## License

This repository is licensed under **GNU GPL-3.0**. The userscripts identify themselves as `GPL-3.0-or-later`; see [`LICENSE`](./LICENSE) for the GPL-3.0 license text.
