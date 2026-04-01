# Possession — SillyTavern Extension

**Possession** lets you "possess" a character — your typed messages are posted under that character's name instead of your own.

## Features

- **Group Chats**: Radio-button toggles on each group member to select who you're possessing.
- **Solo Chats**: A ghost icon toggle button on the character panel.
- **Send Interception**: When possessed, your messages appear as character messages, then AI generation triggers normally.
- **Continue Support**: Type text + press Continue to post as the possessed character, then continue generation.
- **Slash Commands**: `/possess [name]`, `/unpossess` for quick control.
- **Per-Chat Persistence**: Your possession choice is saved per-chat and restored on reload.

## Installation

Clone or download this repository into your SillyTavern extensions directory:

```
SillyTavern/data/default-user/extensions/third-party/Possession/
```

Refresh SillyTavern to load the extension.

## Usage

### Group Chats
Click the radio button next to a character's name in the group member panel. Click again to deselect.

### Solo Chats
Click the ghost icon button in the character panel or right send form area. Click again to deselect.

### Slash Commands

| Command | Description |
|---------|-------------|
| `/possess <name>` | Possess the named character (partial match supported) |
| `/possess` | Show currently possessed character, or toggle in solo chat |
| `/unpossess` | Clear possession |

## Settings

Open the Extensions panel and find the **Possession** drawer:

- **Enable Possession** — Global on/off toggle
- **Show Toast on Possess** — Toast notifications when possessing/unpossessing
- **Debug Mode** — Verbose console logging for troubleshooting

## How It Works

When you send a message while possessing a character:
1. Your text is posted as a character message (attributed to the possessed character)
2. The input field is cleared
3. A generation trigger fires so the AI responds normally

The possessed message includes an `extra.possession = true` metadata flag for traceability by other extensions.
