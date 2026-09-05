# Dudu · Park Companion Skill

**Look forward to your visit. Discover more on site. Leave wanting to return.**

[中文](README.md) · [Hongshan live experience](https://tggai.cn/hongshan-guide/) · [Download Skill](https://github.com/xychendave/dudu-guide-skill/releases/latest) · [Contributing](CONTRIBUTING.md)

Dudu is an open Agent Skill and local starter kit distilled from the Hongshan Dudu zoo companion, created by Tangguoguo AI Studio. Bring your own agent to build companions for zoos, botanical gardens, museums, parks, and exhibitions.

The reusable workflow is simple: plan a visit, offer something worth noticing at each stop, answer questions from traceable sources, adapt when time changes, and preserve the visitor's actual discoveries in a journal.

## Try the local workbench

Requires Node.js 20+ and Git. No third-party npm dependencies or API key are needed.

```bash
git clone https://github.com/xychendave/dudu-guide-skill.git
cd dudu-guide-skill
node skills/dudu-guide/scripts/dudu.mjs init --output output/my-park
node skills/dudu-guide/scripts/dudu.mjs serve --dir output/my-park
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The starter UI and bundled guide instructions are currently in Chinese. The included park is fictional and clearly marked as a demo; it is not a real-world navigation dataset.

The workbench supports time-budgeted routes, manual arrival, source cards, observation prompts, an alternative experience when an animal is not visible, local text check-ins, and Markdown/JSON export. Its route heuristic reserves time for the exit and a buffer, but does not claim global optimality or live navigation.

## Use your own agent

Ask a file-capable agent to read `skills/dudu-guide/SKILL.md`. Compatible clients can install the `skills/dudu-guide` directory through their own skill installation process. Codex users can copy it to `~/.codex/skills/dudu-guide`, then invoke `$dudu-guide` in a new conversation.

Example request:

> Use dudu-guide to build a two-hour botanical garden companion. Start with the local demo, then replace its data using the official material I provide. Identify facts and routes that still need verification.

Clicking “copy question and materials” in the workbench produces context to paste into your own agent. **The starter website does not call a model.** In-page AI chat, speech, image recognition, GPS triggers, and shared observations are extension points, not bundled capabilities.

## Make a place pack

Create a `pack.json` with nodes, walking edges, source metadata, verified facts, and observation suggestions. Validate it, then pass it to the generator:

```bash
node skills/dudu-guide/scripts/dudu.mjs validate --pack path/to/pack.json
node skills/dudu-guide/scripts/dudu.mjs init --pack path/to/pack.json --output output/my-place
npm test
```

See the [place pack reference](skills/dudu-guide/references/place-pack.md). Changing a demo's name does not make its fictional paths or facts real. A disconnected walking graph remains disconnected; the planner does not invent a route.

## Scope, data, and rights

Version 0.1.0 releases the generalized skill, original documentation, a generator, and a local workbench. It is not a production mirror of the Hongshan service. The [case study](docs/hongshan-case-study.md) distinguishes inspected implementation from future ideas and creator-reported workflows.

The starter has no analytics, account system, default upload, or built-in model request. Notes live in the current browser's local storage. Copying material into a cloud agent sends that material to the chosen provider and uses that provider's billing. Local UI does not imply local inference. See [privacy](docs/privacy.md).

Original code, instructions, documentation, and fictional examples are available under the [MIT License](LICENSE). Third-party maps, videos, photos, transcripts, and institutional branding retain their own rights and are not redistributed here. The project does not claim official endorsement by Hongshan Forest Zoo.

Contribute a sourced place pack, a field correction, a new observation activity, an accessible interface improvement, or a journal template. Let every place grow its own companion.
