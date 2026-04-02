// Possession — SillyTavern Extension
// Allows the user to "possess" a character so typed messages are posted under that character's name.

import { selected_group, is_group_generating, groups } from '../../../group-chats.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';

// ─── Constants ───

const EXTENSION_NAME = 'possession';
const METADATA_KEY = 'possession';
const DEBUG_PREFIX = 'POSSESSION-EXTENSION:';

// ─── State ───

let possessedCharName = null;  // Display name of possessed character, or null
let generationGuard = false;   // True while generation is in progress

const defaultSettings = {
    enabled: true,
    showToast: true,
    debugMode: false,
};

let extensionSettings = { ...defaultSettings };

// ─── Helpers ───

function debug(...args) {
    if (!extensionSettings.debugMode) return;
    console.log(DEBUG_PREFIX, ...args);
}

function toast(message, type = 'info') {
    if (!extensionSettings.showToast) return;
    if (typeof toastr !== 'undefined' && toastr[type]) {
        toastr[type](message, 'Possession');
    }
}

function getContext() {
    return SillyTavern.getContext();
}

function isEnabled() {
    return extensionSettings.enabled;
}

function isPossessed() {
    return possessedCharName !== null;
}

// ─── Persistence ───

function savePossessionState() {
    const context = getContext();
    context.chatMetadata[METADATA_KEY] = possessedCharName;
    context.saveMetadata();
    debug('Saved possession state:', possessedCharName);
}

function loadPossessionState() {
    const context = getContext();
    const saved = context.chatMetadata?.[METADATA_KEY] ?? null;
    possessedCharName = saved;
    debug('Loaded possession state:', possessedCharName);
}

function saveExtensionSettings() {
    const context = getContext();
    context.extensionSettings[EXTENSION_NAME] = { ...extensionSettings };
    context.saveSettingsDebounced();
}

function loadExtensionSettings() {
    const context = getContext();
    const saved = context.extensionSettings?.[EXTENSION_NAME];
    if (saved) {
        extensionSettings = { ...defaultSettings, ...saved };
    }
}

// ─── Character Utilities ───

/** Get the character object for the possessed character. Returns null if not found. */
function getPossessedCharacter() {
    if (!possessedCharName) return null;
    const context = getContext();
    return context.characters.find(c => c.name === possessedCharName) ?? null;
}

/** In a group chat, check if the possessed character is still a member. */
function validatePossessedCharInGroup() {
    if (!selected_group || !possessedCharName) return;
    const group = groups.find(g => g.id === selected_group);
    if (!group) return;
    const context = getContext();
    const isMember = group.members.some(avatar => {
        const char = context.characters.find(c => c.avatar === avatar);
        return char && char.name === possessedCharName;
    });
    if (!isMember) {
        debug('Possessed character removed from group, clearing possession');
        toast(`${possessedCharName} was removed from the group. Possession cleared.`, 'warning');
        setPossession(null);
    }
}

// ─── Core Possession Logic ───

function setPossession(charName) {
    const previous = possessedCharName;
    possessedCharName = charName;
    savePossessionState();
    syncAllUI();
    if (previous !== charName) {
        if (charName) {
            toast(`Possessing ${charName}`, 'success');
            debug('Now possessing:', charName);
        } else if (previous) {
            toast('Possession cleared', 'info');
            debug('Possession cleared');
        }
    }
}

// ─── Message Posting (for Continue flow) ───

/**
 * Post text as a character message attributed to the possessed character.
 * Used by the Continue interception flow where we need to add a message
 * programmatically before triggering /continue.
 * Returns the message index of the new message, or -1 on failure.
 */
async function postPossessedMessage(text) {
    const context = getContext();
    const char = getPossessedCharacter();
    if (!char || !text) return -1;

    // Build message object modeled after a normal character message
    const message = {
        name: char.name,
        is_user: false,
        is_system: false,
        send_date: Date.now(),
        mes: text,
        force_avatar: char.avatar ? `/characters/${char.avatar}` : undefined,
        extra: {
            possession: true,
        },
    };

    // If in a group chat, add the original_avatar field that ST uses for group member identification
    if (selected_group) {
        message.original_avatar = char.avatar;
        message.is_name = true;
    }

    // Push to chat array
    context.chat.push(message);
    const messageIndex = context.chat.length - 1;

    // Render the message in the DOM using ST's addOneMessage
    if (typeof context.addOneMessage === 'function') {
        context.addOneMessage(message);
    }

    // Persist the chat
    await context.saveChat();

    debug('Posted possessed message at index', messageIndex);
    return messageIndex;
}

// ─── Send Handling (via MESSAGE_SENT event) ───

/**
 * Called when ST adds a user message to the chat array (before rendering).
 * If possession is active, we convert the user message to a character message
 * in-place. Since this runs before addOneMessage(), ST will render it with
 * the correct character name, avatar, and styling automatically.
 */
async function onMessageSent(messageIndex) {
    if (!isEnabled() || !isPossessed()) return;

    const context = getContext();
    const message = context.chat[messageIndex];
    if (!message || !message.is_user) return;

    const char = getPossessedCharacter();
    if (!char) return;

    debug('Converting user message to possessed character message at index', messageIndex);

    // Convert user message to character message in-place
    message.is_user = false;
    message.name = char.name;
    message.force_avatar = char.avatar ? `/characters/${char.avatar}` : undefined;
    message.extra = { ...(message.extra || {}), possession: true };

    if (selected_group) {
        message.original_avatar = char.avatar;
        message.is_name = true;
    }

    debug('Converted message — name:', char.name, 'is_user:', message.is_user);
}

// ─── Continue Interception ───

/**
 * Intercept the Continue button when possession is active and the user has
 * typed text. We need interception here because the Continue flow does not
 * read the textarea — it just extends the last message. So we must manually
 * post the possessed message first, then trigger /continue.
 */
function handleContinueIntercept(event) {
    if (!isEnabled() || !isPossessed() || generationGuard) return;

    const textarea = document.getElementById('send_textarea');
    const text = textarea?.value?.trim();
    if (!text) return; // No text — let normal continue through

    // Stop the native continue
    event.stopImmediatePropagation();
    event.preventDefault();

    debug('Intercepted Continue with text:', text.substring(0, 50) + '...');

    executePossessedContinue(text);
}

async function executePossessedContinue(text) {
    const context = getContext();

    // Clear textarea
    const textarea = document.getElementById('send_textarea');
    if (textarea) {
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Post the character message
    await postPossessedMessage(text);

    // Wait for DOM update, then continue
    await new Promise(resolve => requestAnimationFrame(resolve));

    if (context.executeSlashCommandsWithOptions) {
        await context.executeSlashCommandsWithOptions('/continue');
    } else {
        const continueBtn = document.getElementById('option_continue');
        if (continueBtn) continueBtn.click();
    }
}

// ─── Event Listener Setup ───

/**
 * Attach interception listener for the Continue button at the document level
 * in the capture phase. This fires before ST's bubble-phase handlers.
 * Note: Send/Enter no longer needs interception — it's handled via the
 * MESSAGE_SENT event instead.
 */
function attachContinueInterceptor() {
    document.addEventListener('click', (event) => {
        if (!event.target.closest('#option_continue') && !event.target.closest('#mes_continue')) return;
        handleContinueIntercept(event);
    }, { capture: true });
    debug('Attached document-level click interceptor for continue buttons');
}

// ─── UI: Group Chat Radio Buttons ───

function injectGroupRadioButtons() {
    if (!selected_group) return;
    if (!isEnabled()) return;

    const group = groups.find(g => g.id === selected_group);
    if (!group) return;

    const context = getContext();

    // Find group member entries in the DOM
    const memberEntries = document.querySelectorAll('.group_member');
    memberEntries.forEach(entry => {
        // Avoid duplicates
        if (entry.querySelector('.possession_radio_wrapper')) return;

        // Determine which character this entry represents
        const charId = entry.getAttribute('chid');
        const charAvatar = entry.getAttribute('grid');
        let charName = null;

        if (charId !== null) {
            const char = context.characters[parseInt(charId)];
            if (char) charName = char.name;
        } else if (charAvatar) {
            const char = context.characters.find(c => c.avatar === charAvatar);
            if (char) charName = char.name;
        }

        if (!charName) {
            // Try to get name from the entry's text content
            const nameEl = entry.querySelector('.ch_name, .character_name, [title]');
            if (nameEl) charName = nameEl.textContent?.trim() || nameEl.getAttribute('title');
        }

        if (!charName) return;

        // Create radio button
        const wrapper = document.createElement('div');
        wrapper.classList.add('possession_radio_wrapper');
        wrapper.title = `Possess ${charName}`;

        const radio = document.createElement('div');
        radio.classList.add('possession_radio');
        radio.dataset.charName = charName;

        if (possessedCharName === charName) {
            radio.classList.add('possession_active');
            entry.classList.add('possession_possessed');
        }

        radio.addEventListener('click', (event) => {
            event.stopPropagation();
            if (possessedCharName === charName) {
                setPossession(null); // Toggle off
            } else {
                setPossession(charName);
            }
        });

        wrapper.appendChild(radio);

        // Insert at the left side of the button grouping (before the mute button)
        const iconContainer = entry.querySelector('.group_member_icon');
        if (iconContainer) {
            iconContainer.insertBefore(wrapper, iconContainer.firstChild);
        } else {
            entry.appendChild(wrapper);
        }
    });
}

function syncGroupRadioButtons() {
    // Update active states on all radio buttons
    document.querySelectorAll('.possession_radio').forEach(radio => {
        const charName = radio.dataset.charName;
        radio.classList.toggle('possession_active', charName === possessedCharName);
    });

    // Update member entry highlights
    document.querySelectorAll('.group_member').forEach(entry => {
        entry.classList.remove('possession_possessed');
    });

    if (possessedCharName) {
        document.querySelectorAll('.possession_radio.possession_active').forEach(radio => {
            const member = radio.closest('.group_member');
            if (member) member.classList.add('possession_possessed');
        });
    }
}

function removeGroupRadioButtons() {
    document.querySelectorAll('.possession_radio_wrapper').forEach(el => el.remove());
    document.querySelectorAll('.group_member.possession_possessed').forEach(el => {
        el.classList.remove('possession_possessed');
    });
}

// ─── UI: Solo Chat Possess Button ───

function injectSoloButton() {
    if (selected_group) return;
    if (!isEnabled()) return;
    if (document.getElementById('possession_solo_btn')) return;

    // Try to find the character editor button row
    const panelButtonRow = document.querySelector('#form_create .ch_creation_btn_row, #form_create .form_create_bottom_buttons_block');

    // Fallback: insert into rightSendForm
    const target = panelButtonRow || document.getElementById('rightSendForm');
    if (!target) return;

    const btn = document.createElement('div');
    btn.id = 'possession_solo_btn';
    btn.classList.add('menu_button', 'interactable');
    btn.title = 'Possess this character';
    btn.innerHTML = '<span class="fa-solid fa-ghost"></span>';

    if (isPossessed()) {
        btn.classList.add('possession_active');
    }

    btn.addEventListener('click', () => {
        const context = getContext();
        const char = context.characters?.[context.characterId];
        if (!char) return;

        if (possessedCharName === char.name) {
            setPossession(null);
        } else {
            setPossession(char.name);
        }
    });

    target.appendChild(btn);
    debug('Injected solo possess button');
}

function syncSoloButton() {
    const btn = document.getElementById('possession_solo_btn');
    if (!btn) return;
    btn.classList.toggle('possession_active', isPossessed());
}

function removeSoloButton() {
    const btn = document.getElementById('possession_solo_btn');
    if (btn) btn.remove();
}

// ─── UI Sync ───

function syncAllUI() {
    if (!isEnabled()) {
        removeGroupRadioButtons();
        removeSoloButton();
        return;
    }

    if (selected_group) {
        removeSoloButton();
        injectGroupRadioButtons();
        syncGroupRadioButtons();
    } else {
        removeGroupRadioButtons();
        injectSoloButton();
        syncSoloButton();
    }
}

// ─── Settings Panel ───

function injectSettingsPanel() {
    if (document.getElementById('possession_settings')) return;

    const settingsContainer = document.getElementById('extensions_settings');
    if (!settingsContainer) return;

    settingsContainer.insertAdjacentHTML('beforeend', `
        <div id="possession_settings" class="extension_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Possession</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label">
                        <input id="possession_enabled" type="checkbox" />
                        <span>Enable Possession</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="possession_show_toast" type="checkbox" />
                        <span>Show Toast on Possess/Unpossess</span>
                    </label>
                    <label class="checkbox_label">
                        <input id="possession_debug_mode" type="checkbox" />
                        <span>Debug Mode (console logging)</span>
                    </label>
                </div>
            </div>
        </div>
    `);

    // Set initial values
    document.getElementById('possession_enabled').checked = extensionSettings.enabled;
    document.getElementById('possession_show_toast').checked = extensionSettings.showToast;
    document.getElementById('possession_debug_mode').checked = extensionSettings.debugMode;

    // Bind change handlers
    document.getElementById('possession_enabled').addEventListener('change', (e) => {
        extensionSettings.enabled = e.target.checked;
        saveExtensionSettings();
        syncAllUI();
        debug('Extension enabled:', extensionSettings.enabled);
    });

    document.getElementById('possession_show_toast').addEventListener('change', (e) => {
        extensionSettings.showToast = e.target.checked;
        saveExtensionSettings();
    });

    document.getElementById('possession_debug_mode').addEventListener('change', (e) => {
        extensionSettings.debugMode = e.target.checked;
        saveExtensionSettings();
        debug('Debug mode:', extensionSettings.debugMode);
    });
}

// ─── Slash Commands ───

function registerSlashCommands() {
    // /possess [name] — Select a character to possess, or show current
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'possess',
        callback: async (namedArgs, unnamedArgs) => {
            const name = unnamedArgs?.trim();

            // No args: display current or toggle in solo
            if (!name) {
                if (isPossessed()) {
                    toastr.info(`Currently possessing: ${possessedCharName}`, 'Possession');
                    return possessedCharName;
                }
                // In solo chat with no args, toggle possession of the active character
                if (!selected_group) {
                    const context = getContext();
                    const char = context.characters?.[context.characterId];
                    if (char) {
                        setPossession(char.name);
                        return char.name;
                    }
                }
                toastr.info('No character is currently possessed.', 'Possession');
                return 'None';
            }

            // Find matching character
            const context = getContext();
            const nameLower = name.toLowerCase();

            if (selected_group) {
                const group = groups.find(g => g.id === selected_group);
                if (!group) {
                    toastr.error('No active group found.', 'Possession');
                    return '';
                }
                const match = group.members
                    .map(avatar => context.characters.find(c => c.avatar === avatar))
                    .filter(Boolean)
                    .find(c => c.name.toLowerCase().includes(nameLower));

                if (!match) {
                    toastr.error(`No group member matching "${name}" found.`, 'Possession');
                    return '';
                }
                setPossession(match.name);
                return match.name;
            } else {
                const char = context.characters?.[context.characterId];
                if (char && char.name.toLowerCase().includes(nameLower)) {
                    setPossession(char.name);
                    return char.name;
                }
                toastr.error(`Character "${name}" does not match the active character.`, 'Possession');
                return '';
            }
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Character name (partial match). Omit to show current or toggle in solo chat.',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
            }),
        ],
        aliases: [],
        helpString: 'Possess a character so your messages are posted under their name. Usage: /possess [name]',
    }));

    // /unpossess — Clear possession
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'unpossess',
        callback: async () => {
            if (isPossessed()) {
                setPossession(null);
            }
            return '';
        },
        unnamedArgumentList: [],
        aliases: [],
        helpString: 'Clear the currently possessed character, returning to normal mode.',
    }));

    debug('Registered slash commands');
}

// ─── Event Handlers ───

function onChatChanged() {
    loadPossessionState();
    syncAllUI();
    debug('Chat changed, state reloaded');
}

function onGroupUpdated() {
    validatePossessedCharInGroup();
    // Re-inject radio buttons in case members changed
    removeGroupRadioButtons();
    injectGroupRadioButtons();
    syncGroupRadioButtons();
    debug('Group updated, UI rebuilt');
}

function onCharacterPageLoaded() {
    if (!selected_group) {
        injectSoloButton();
        syncSoloButton();
    }
}

function onGenerationStarted() {
    generationGuard = true;
    debug('Generation started, guard ON');
}

function onGenerationEnded() {
    generationGuard = false;
    syncAllUI();
    debug('Generation ended, guard OFF, UI synced');
}

function onGenerationStopped() {
    generationGuard = false;
    syncAllUI();
    debug('Generation stopped, guard OFF, UI synced');
}

// ─── Initialization ───

function init() {
    debug('Initializing Possession extension...');

    // Load settings
    loadExtensionSettings();

    // Load per-chat state
    loadPossessionState();

    // Register slash commands
    registerSlashCommands();

    // Inject settings panel
    injectSettingsPanel();

    // Attach continue interceptor (send is handled via MESSAGE_SENT event)
    attachContinueInterceptor();

    // Subscribe to events
    const { eventSource, eventTypes } = getContext();

    if (eventTypes.CHAT_CHANGED) {
        eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);
    }
    if (eventTypes.GROUP_UPDATED) {
        eventSource.on(eventTypes.GROUP_UPDATED, onGroupUpdated);
    }
    if (eventTypes.CHARACTER_PAGE_LOADED) {
        eventSource.on(eventTypes.CHARACTER_PAGE_LOADED, onCharacterPageLoaded);
    }
    if (eventTypes.GENERATION_STARTED) {
        eventSource.on(eventTypes.GENERATION_STARTED, onGenerationStarted);
    }
    if (eventTypes.GENERATION_ENDED) {
        eventSource.on(eventTypes.GENERATION_ENDED, onGenerationEnded);
    }
    if (eventTypes.GENERATION_STOPPED) {
        eventSource.on(eventTypes.GENERATION_STOPPED, onGenerationStopped);
    }

    // MESSAGE_SENT: convert user messages to possessed character messages
    if (eventTypes.MESSAGE_SENT) {
        eventSource.on(eventTypes.MESSAGE_SENT, onMessageSent);
    }

    // Initial UI sync
    syncAllUI();

    debug('Possession extension initialized');
}

jQuery(async () => {
    init();
});
