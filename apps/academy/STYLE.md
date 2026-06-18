# Academy Voice & Style

The canonical voice definition for everything under `apps/academy/docs/academy`. This is the single source of truth: the doc skills (`/doc-clarity`, `/doc-voice`) reference it, and human writers should read it before touching a page. When the voice changes, edit this file — not the skills.

This file defines **how the academy sounds**, not what it covers. For code-correctness rules see `/doc-review`; for structure and scope see `/doc-clarity`.

---

## The voice in one line

Write like a senior engineer explaining the system to a competent peer who is in a hurry: direct, specific, honest about limits, no filler.

---

## Core rules

1. **Second person, present tense, imperative for steps.**
   - "Click **Build**." not "The Build pane can be opened by clicking."
   - "The agent creates a session document." not "A session document will be created."

2. **Specific beats generic.** Name the real thing — the port, the file path, the function, the number. Specificity is the single strongest signal that a human who knows the system wrote the page. Vague abstraction is the strongest signal that no one did.
   - "boots in 10–30 seconds" not "boots quickly"
   - "writes to `vetra-app/editors/`" not "writes to the relevant directory"

3. **Lead with the action or the fact.** Cut the throat-clearing clause that precedes it.
   - Bad: "In this section, we'll take a look at how you can go about creating a session."
   - Good: "To create a session:"

4. **Short declarative sentences.** One idea per sentence. If a sentence has two "and"s and a "which", split it.

5. **Be honest about state.** "This doesn't work yet — coming in a later release" beats silence. "Currently in beta" beats pretending it's finished. Honesty reads as competence.

6. **Don't sell.** The reader already chose to be here. No adjectives doing marketing work ("powerful", "seamless", "robust"). Show the capability with a concrete example; let the reader conclude it's good.

---

## Banned lexicon

Ban the left column. Use the right.

| Don't write | Write instead |
| --- | --- |
| leverage, utilize | use |
| delve into, dive into, let's explore | (just explain it) |
| seamless / seamlessly | (delete — or describe what actually happens) |
| robust, powerful, comprehensive, rich | (delete — show it instead) |
| unlock, elevate, supercharge, empower, streamline | (delete) |
| in the world of / realm of / landscape of / ecosystem of | (delete) |
| it's worth noting that / it's important to note that | (just state the thing) |
| in order to | to |
| facilitate | lets you / does X |
| a wide range of / a variety of | (give the actual list) |
| ensure (when overused) | make sure / verify (sparingly) |
| simply, just, easily, effortlessly | (delete — if it were easy you wouldn't be documenting it) |
| utilizing, leveraging | using |
| boasts, offers, provides | has / is |

---

## Structural LLM-isms

Harder to spot than single words, and more damaging because they shape whole pages. Flag and remove:

- **Throat-clearing intros.** Any opening sentence that announces the section instead of starting it ("In this section, we'll explore…", "Let's take a look at…").
- **The rule of three everywhere.** Not every list wants exactly three items, and not every description needs "fast, reliable, and scalable." Use the real number of real items.
- **"It's not just X — it's Y"** framing. Delete.
- **Closing summaries.** "By following these steps, you'll have successfully…" Cut it; the steps already did the work. End on the last real step or a real next-step link.
- **Chummy filler.** "Let's…", "Now, the fun part…", "Don't worry…". Respect the reader's time instead.
- **Decorative emphasis.** Emoji in headings; **bold** sprinkled mid-sentence for emphasis rather than for real terms. Bold is for defined terms and UI labels.
- **Over-hedging.** "you may want to consider possibly" → "use X if Y", or just state it.

---

## The em-dash rule

The em-dash is legitimate punctuation and these docs use it well. But heavy em-dash density has become a recognised machine-writing tell, and several academy pages currently run ~10 per page.

- **Cap: at most one em-dash per paragraph.** Beyond that, prefer a period, a colon, or parentheses.
- A colon is usually better when the dash introduces a list or definition.
- A period is usually better when the dash is splicing two full sentences.

---

## Audience calibration

Match the doc type (same buckets as `/doc-clarity`):

- **Tutorial** (`get-started`, `build-*`) — developers who know JS/TS and React. Don't explain `async/await`, imports, or hook rules. Do define Powerhouse-specific terms (Reactor, Drive, Document Model, Switchboard, Renown) on first use.
- **API reference** (`reference-*`, except `reference-architecture`) — developers actively building on Powerhouse. Don't explain what a hook or a generic is. Be terse and exact.
- **Conceptual** (`learn`, `lookup`, `reference-architecture`) — broadly technical readers. Explain Powerhouse concepts; don't explain general programming. More natural prose is allowed here than in steps.

---

## Before / after

**Marketing adjectives → concrete capability**
> Before: Vetra Studio is a powerful, seamless environment that empowers you to effortlessly build robust solutions.
> After: Vetra Studio lets you build local-first, specification-driven products and watch a live preview as the agent builds them.

**Throat-clearing + passive → direct**
> Before: In this section, we will be taking a look at how a new session can be created by the user.
> After: To create a session:

**Hedged and indirect → direct**
> Before: It is recommended that you may want to consider utilizing the `reactor-project-start` tool in order to facilitate the preview.
> After: Call `reactor-project-start` to boot the preview.

**Vague → specific**
> Before: The dev server starts up fairly quickly and the preview will appear shortly after.
> After: The dev server warms up in 10–30 seconds, then the BUILD pane loads the preview iframe.

---

## What NOT to flag

- Prose that is correct, clear, and specific, even if it's not the shortest possible phrasing. Terse is the goal, not telegraphic.
- Technical precision that looks verbose but is needed for correctness.
- An em-dash used well, within the per-paragraph cap.
- Style micro-preferences with no readability impact (Oxford comma, British vs. American spelling) — pick one and move on; don't churn pages over it.
