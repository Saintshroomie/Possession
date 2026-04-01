# Possession — SillyTavern Extension Requirements

**Version:** 1.1  
**Author:** Chris Phifer  
**Date:** April 2026  
**Status:** Draft (Revised)

---

## 1. Overview

**Possession** is a SillyTavern third-party extension that allows the user to "possess" a character — selecting them as the user's active speaking persona so that user-typed messages are posted to the chat under that character's name instead of the user's name.

In **group chats**, the user selects a character from the group member panel via a radio-button toggle. In **solo chats**, the user possesses the single active character via a toggle button on the character info panel. When possession is active, Send posts the user's text as a character message, then triggers normal AI generation with a blank input (prompting the next character in the reply order to respond). When no character is possessed, SillyTavern behaves normally.

---

## 2. Scope & Constraints

**In Scope:**
- Group chats and solo (1:1) chats.
- Intercepting user Send and Continue actions to reroute text as character messages.
- UI controls in the group member panel (group chats) and character info panel (solo chats).
- Per-chat persistence of the possessed character selection.
- Slash commands for programmatic control.
- Triggering normal AI generation after posting a possessed message.

**Out of Scope (v1.0):**
- Modifying the prompt pipeline or character card injection (the possessed character's card is not swapped into the user role — the message is simply attributed to them in the chat history).
- Multi-character possession (only one character at a time).
- Any visual distinction between user-authored character messages and LLM-generated character messages. Possessed messages should look identical to normal character messages.

---

## 3. Functional Requirements

### 3.1 Character Selection UI — Group Chats

**FR-01:** When a group chat is active, the extension shall add a radio-button-style toggle to each character's entry in the group member panel.

**FR-02:** Only one character may be selected (possessed) at a time. Selecting a new character deselects the previously possessed character.

**FR-03:** Clicking the radio button for an already-possessed character shall deselect it, returning to normal (unpossessed) mode. The control functions as a toggle — not a strict radio group that always requires a selection.

**FR-04:** When no character is possessed, the radio buttons shall all appear in their deselected/default state.

**FR-05:** The possessed character's radio button and/or member panel entry shall display a clear visual indicator (e.g., highlighted state or accent-colored dot) confirming the active possession.

**FR-06:** If a possessed character is removed from the group while possessed, the extension shall automatically deselect them and return to normal mode, displaying a toast notification. Muted characters may still be possessed — muting does not trigger deselection.

### 3.2 Character Selection UI — Solo Chats

**FR-07:** When a solo (1:1) chat is active, the extension shall add a "Possess" toggle button to the character info area in the right panel. The recommended placement is in the row of action/utility buttons beneath the character avatar in the character editor panel (near the Favorite, Advanced Definitions, and similar controls). The button shall use a recognizable icon (e.g., `fa-ghost`, `fa-mask`, or similar) and a short label or tooltip ("Possess").

**FR-08:** Clicking the Possess button shall toggle possession of the active character on/off. When possession is active, the button shall display a visually distinct active state (e.g., accent color, filled icon) matching ST's standard active-button patterns.

**FR-09:** When the user switches characters (navigates to a different solo chat), the Possess button state shall reset or load from the saved per-chat state for the new character.

### 3.3 Message Interception — Send

**FR-10:** When a character is possessed and the user presses Send (via the Send button, Enter key, or equivalent input action), the extension shall intercept the normal user message flow.

**FR-11:** The intercepted text shall be posted to the chat as a **character message** attributed to the possessed character — not as a user message. The message object in `context.chat` shall have:
- `is_user`: `false`
- `name`: the possessed character's display name
- `force_avatar`: the possessed character's avatar identifier (if applicable, to render the correct avatar)
- `mes`: the user's typed text
- `is_system`: `false`
- `extra.possession`: `true` (traceability flag — see §3.7)

**FR-12:** The intercepted message shall be rendered in the chat DOM with the possessed character's name and avatar, visually identical to a message the AI generated for that character. No special styling, border, or icon shall distinguish it.

**FR-13:** After posting the possessed message, the input textarea (`#send_textarea`) shall be cleared.

**FR-14:** After posting the possessed message and clearing the textarea, the extension shall trigger a normal Send/generation action with the now-empty input field. This causes SillyTavern to process a generation request as if the user pressed Send with no text, prompting the next appropriate character to respond according to the active reply order strategy (Natural Order, List Order, etc.).

**FR-15:** If the user has text in `#send_textarea` but no character is possessed, the Send action shall proceed normally (standard user message + generation trigger).

### 3.4 Message Interception — Continue

**FR-16:** When a character is possessed, the user has text in `#send_textarea`, and the user presses Continue (either `#option_continue` or `#mes_continue`), the extension shall:
1. Post the textarea text as a character message attributed to the possessed character (per FR-11/FR-12).
2. Clear the textarea.
3. Execute a Continue action (`/continue` or equivalent) so the LLM extends the newly posted character message.

**FR-17:** If Continue is pressed with no text in the textarea while a character is possessed, the extension shall not intercept — the Continue shall proceed normally (extending the last message in the chat, regardless of who sent it).

**FR-18:** If Continue is pressed with text in the textarea but no character is possessed, the extension shall not intercept — standard SillyTavern Continue behavior applies.

### 3.5 Persistence

**FR-19:** The currently possessed character selection shall be stored in `context.chatMetadata` so it persists across page reloads for the same chat.

**FR-20:** On `CHAT_CHANGED`, the extension shall load the saved possession state for the new chat and update the UI accordingly. If no saved state exists, all controls default to deselected.

### 3.6 Slash Commands

**FR-21:** The extension shall register the following slash commands:

| Command | Arguments | Behavior |
|---------|-----------|----------|
| `/possess <name>` | Character name (partial match OK) | Selects the named character as the possessed persona. In group chats, the name must match a group member. In solo chats, the name must match the active character. Fails with a toast if no match. |
| `/unpossess` | None | Deselects the currently possessed character, returning to normal mode. No-op if nothing is possessed. |
| `/possess` | None (no args) | Displays the currently possessed character name, or "None" if unpossessed. |

**FR-22:** Slash commands shall update both the internal state and the UI controls to stay in sync.

### 3.7 Traceability

**FR-23:** Every message posted via the Possession extension shall include `extra.possession = true` in the message object's `extra` metadata. This flag allows other extensions or future features to distinguish user-authored character messages from LLM-generated ones. The flag has no visual effect — it is metadata only.

### 3.8 Settings

**FR-24:** The extension shall add a settings panel in `#extensions_settings` with the following options:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Enable Possession | Checkbox | `true` | Global on/off toggle. When disabled, all interception is bypassed and UI controls are hidden. |
| Show Toast on Possess | Checkbox | `true` | Show a toast notification when a character is possessed/unpossessed. |

**FR-25:** Settings shall be stored in `context.extensionSettings.possession` and persist globally across all chats.

---

## 4. Non-Functional Requirements

**NFR-01:** The extension shall have no effect on prompt construction. It does not inject content via `setExtensionPrompt`, modify the system prompt, or alter the character card selection during generation.

**NFR-02:** The extension shall not interfere with normal group chat or solo chat generation. After a possessed message is posted and the subsequent generation trigger fires, the LLM generates as usual — the extension's job ends once the message is in the chat array and the generation is triggered.

**NFR-03:** The extension shall follow SillyTavern extension conventions: single `index.js` entry point, `style.css` for styling using ST CSS variables, `manifest.json` for metadata. No build step, no external dependencies.

**NFR-04:** All DOM element IDs and CSS classes shall be prefixed with `possession_` to avoid collisions.

**NFR-05:** The extension shall include a conditional debug logger controlled by a `debugMode` setting. When enabled, debug messages shall be prepended with `POSSESSION-EXTENSION:` and log state changes, interception events, and guard flag status to the browser console.

---

## 5. Technical Design Notes

These are architectural guidance notes for implementation, not requirements.

### 5.1 Interception Strategy

The core challenge is intercepting the Send action before SillyTavern's native handler processes it. Two viable approaches:

**Approach A — Keydown/Click Capture (Recommended):**  
Attach a `keydown` listener (for Enter) on `#send_textarea` and a `click` listener on `#send_but` (or the relevant send button) using `{ capture: true }` to fire before ST's own handlers. When possession is active and text exists, call `event.stopImmediatePropagation()` and `event.preventDefault()` to suppress the native Send, then execute the possessed-message posting logic followed by a programmatic generation trigger.

Risks: If SillyTavern restructures its send button IDs or event handling, the interception may break. Fragile but direct.

**Approach B — Textarea Swap + Slash Command:**  
When possession is active, instead of intercepting Send, pre-process the input: read the textarea text, clear it, programmatically inject the character message into `context.chat`, re-render, then trigger generation via `/trigger` or by programmatically invoking `Send_press()` / clicking `#send_but` with the textarea now empty.

Recommendation: Start with Approach A. Fall back to B if capture-phase interception proves unreliable across ST versions.

### 5.2 Posting a Character Message

SillyTavern's chat array stores message objects. To post as a character, the extension must:

1. Construct a message object with `is_user: false`, `name: <character name>`, `mes: <typed text>`, `force_avatar: <avatar>`, `extra: { possession: true }`, and appropriate metadata.
2. Push it onto `context.chat`.
3. Render it in the DOM (either by calling a re-render utility or by manually constructing the message HTML matching ST's `.mes` structure).
4. Call `context.saveChat()` to persist.

The exact message object shape should be derived from examining an existing character message in `context.chat` at runtime — copy its structure and override `name`, `mes`, `force_avatar`, and `extra`.

### 5.3 Post-Send Generation Trigger

After posting the possessed message (§5.2), the extension must trigger a normal generation cycle so the LLM responds. The approach:

1. Ensure `#send_textarea` is empty (already cleared in FR-13).
2. Programmatically trigger a Send action — either by clicking `#send_but`, calling `Send_press()` if accessible, or using `context.executeSlashCommandsWithOptions` with an appropriate command.
3. Because the textarea is empty, SillyTavern should treat this as a "generate next response" action, selecting the next character per the reply order strategy (group) or generating as the character (solo).

Note: The exact behavior of an empty-textarea Send may vary. If ST ignores empty sends, an alternative is to use `/trigger` in group chats (to explicitly trigger the next character) or `/continue` logic. This should be tested empirically during implementation.

### 5.4 Continue Integration

For the possessed-Send-then-Continue flow (FR-16):

1. Post the character message (per §5.2).
2. Wait for the DOM to update (short `setTimeout` or `requestAnimationFrame`).
3. Execute `/continue` via `context.executeSlashCommandsWithOptions('/continue')`.

The Continue action will extend the last message in the chat — which is now the possessed character's message.

### 5.5 Solo Chat UI Placement

In solo chat mode, the right panel shows the character editor when you click the character's name. The editor contains:
- The character avatar (large)
- A row of utility buttons beneath the avatar (Favorite, Tags, Advanced Definitions, More...)
- The character description textarea and other card fields

The recommended placement for the Possess toggle button is **in the row of utility buttons beneath the avatar**. This keeps it visible when the character panel is open, colocated with other character-level actions, and out of the way when the panel is closed.

Implementation: On `CHAT_CHANGED` or `CHARACTER_PAGE_LOADED`, check for the button row container and inject the Possess button if it doesn't already exist. Use ST's standard button classes (`menu_button`, `interactable`, or equivalent) for consistent styling.

Fallback: If the right panel structure proves difficult to inject into reliably, an alternative is to add the Possess toggle to the `#rightSendForm` quick-action bar (always visible in the input area). This is less contextually ideal but guaranteed to be accessible.

### 5.6 Group Member Panel DOM Injection

The group member panel lists character entries. The extension should:

1. Observe the panel for changes (characters added/removed, panel open/close) using a `MutationObserver` or by hooking `GROUP_UPDATED` / `CHAT_CHANGED` events.
2. For each character entry, inject a radio button element if one doesn't already exist.
3. Bind click handlers that update the internal state and re-sync all radio buttons.

Guard against duplicates: always check for existing `possession_` prefixed elements before injecting.

### 5.7 Event Subscriptions

| Event | Purpose |
|-------|---------|
| `CHAT_CHANGED` | Load/clear possession state, rebuild UI |
| `GROUP_UPDATED` | Re-sync radio buttons if members changed, deselect if possessed character removed |
| `CHARACTER_PAGE_LOADED` | Inject Possess button into solo chat character panel |
| `GENERATION_STARTED` | Set guard flag to defer interception (belt-and-suspenders safety; ST already hides the send button during generation) |
| `GENERATION_ENDED` | Clear guard flag |

---

## 6. File Structure

```
possession/
├── manifest.json       # Extension metadata
├── index.js            # All extension logic
├── style.css           # Scoped styles using ST CSS variables
└── README.md           # User-facing documentation
```

---

## 7. Open Questions

**OQ-01:** How does SillyTavern handle an empty-textarea Send in group chat mode? Does it trigger the next character in the reply order, or does it no-op? This needs to be tested empirically. If it no-ops, the extension may need to use `/trigger` to explicitly invoke the next responder after posting the possessed message.

**OQ-02:** In solo chat mode, does an empty-textarea Send trigger generation as the character? If not, the extension may need to invoke `/continue` or `/trigger <charname>` instead.

**OQ-03:** Should `/possess` in a solo chat accept no name argument (since there's only one character)? Recommendation: Yes — `/possess` with no args in a solo chat should toggle possession of the active character.
