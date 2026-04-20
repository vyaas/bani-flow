# ADR-047: Dismiss Mobile Keyboard After Search Selection

**Status**: Proposed  
**Date**: 2026-04-19  
**Agents**: graph-architect

## Context

On mobile, when the user selects an item from the search dropdown (musician, raga, or composition), the virtual keyboard stays open. This obscures the listening trail / panel content that was just populated. The user must manually dismiss the keyboard, which breaks flow.

The search inputs (`#musician-search-input`, `#bani-search-input`) use a shared `makeDropdown()` helper in `search.js`. The `mousedown` handler on dropdown items calls `onSelect(item)`, clears the input value, and hides the dropdown — but never calls `inputEl.blur()` to dismiss the keyboard. The `bani-search-input` also triggers `triggerBaniSearch()` which now opens the Bani Flow panel (ADR-046), but the keyboard remains in front of it.

## Forces

- **Reinforce completion**: After a user selects a result, the keyboard has no purpose. Leaving it open signals "we're still waiting for input" when the action is already done.
- **Reveal content**: The listening trail that triggerBaniSearch populates is hidden behind the keyboard on screens < 768px — exactly the content the user wants to see.
- **Focus management**: `blur()` reliably dismisses the keyboard on iOS and Android browsers.

## Pattern

**Boundaries**: The keyboard is an input boundary. Once the selection crosses the boundary (dropdown item tapped), the input context should close completely — dropdown, text, and keyboard.

## Decision

### Before (search.js — `makeDropdown` mousedown handler)
```js
div.addEventListener('mousedown', e => {
  e.preventDefault();
  onSelect(item);
  inputEl.value = '';
  dropdownEl.style.display = 'none';
});
```

### After
```js
div.addEventListener('mousedown', e => {
  e.preventDefault();
  onSelect(item);
  inputEl.value = '';
  dropdownEl.style.display = 'none';
  inputEl.blur();  // dismiss mobile keyboard
});
```

Also apply to the Enter key path, which dispatches a synthetic `mousedown` on the active item.

## Consequences

- Keyboard dismisses immediately on dropdown selection (mousedown + Enter).
- Desktop: `blur()` is harmless — focus leaves the input, which is the expected behavior after selection anyway.
- No new CSS or HTML changes needed.

## Implementation

1. In `search.js`, add `inputEl.blur()` after `dropdownEl.style.display = 'none'` in the mousedown handler.
2. Render and verify on mobile.
