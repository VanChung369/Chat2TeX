# Chat2TeX Share-Toolbar Export Trigger

## Context

The in-page `Chat2TeX Export` trigger is currently a large fixed pill at the
bottom-right of the viewport. On narrow ChatGPT layouts, that position overlaps
the composer and Send control.

## Goal

Place a compact Chat2TeX trigger beside ChatGPT's Share control, keep it usable
across responsive layouts and single-page navigation, and prevent it from
returning to the composer area.

## Non-goals

- Redesigning the export form or export workflow.
- Changing the popup extension UI.
- Depending on private ChatGPT application state.
- Creating a commit as part of this change.

## Chosen Design

### Trigger placement

The content script will locate the visible Share control in ChatGPT's header.
It will prefer stable attributes such as a Share-related test ID or accessible
label, then fall back to normalized visible button text (`Share` or
`Chia sẻ`). The Chat2TeX root will be inserted as the Share control's immediate
preceding sibling.

If the header is not available yet, the root will temporarily use a compact
fixed fallback at the top-right of the viewport. A debounced `MutationObserver`
will retry placement and move the same root beside Share when ChatGPT finishes
rendering. It will also restore placement after conversation navigation or a
header re-render without duplicating the trigger.

### Trigger appearance

The trigger will be an icon-only 32 by 32 pixel button with a document/export
SVG. It will have:

- `type="button"`
- `title="Chat2TeX Export"`
- `aria-label="Chat2TeX Export"`
- a visible keyboard focus ring
- a native-looking neutral surface instead of the current large gradient pill

The root will use inline-flex positioning when mounted in the header and fixed
top-right positioning only while in fallback mode.

### Export panel

The export panel will be portaled to `document.body` so a ChatGPT header with
clipping or stacking styles cannot cut it off. When opened, it will be
positioned below and aligned to the right edge of the trigger using the
trigger's bounding rectangle.

The panel width will remain 380 pixels on roomy viewports and will be capped at
`calc(100vw - 24px)`. Its height will be capped to the available viewport and
its body will scroll when necessary. Resize events will reposition an open
panel. Existing form state and export behavior remain unchanged.

### Lifecycle

`mount()` will create one trigger, install the placement observer, and schedule
an initial placement. Repeated mounts will remove stale Chat2TeX roots before
creating the replacement. The observer will ignore mutations caused solely
inside the Chat2TeX root or panel and will debounce document-wide retries.

## Error and Fallback Behavior

- Missing Share control: show the compact top-right fallback, never the old
  bottom-right pill.
- Header re-render: move the existing trigger into the new header action group.
- Share control hidden at a breakpoint: retain the top-right fallback.
- Panel would cross the viewport: clamp it to 12-pixel horizontal margins and
  the available vertical space.

## Testing

Automated jsdom tests will cover:

1. Trigger insertion immediately before an English Share control.
2. Trigger insertion before a Vietnamese `Chia sẻ` control.
3. Compact fallback placement when Share is absent.
4. Moving the same trigger from fallback to the header after a DOM mutation.
5. No duplicate trigger after repeated placement.
6. Icon-only accessible button attributes and 32-pixel styling.
7. Panel attachment to `document.body` and viewport-constrained positioning.

The test will be written and observed failing before production changes. After
implementation, the focused test, complete test suite, TypeScript compile,
extension build, ZIP packaging, and package policy gate will run. Rendered QA
will check one desktop and one narrow viewport, with special attention to the
ChatGPT Send control and header actions.

## Success Criteria

- The Chat2TeX trigger is next to Share whenever Share is rendered.
- The trigger is visibly smaller than the current pill and remains accessible.
- No Chat2TeX control overlaps the composer or Send control on a narrow screen.
- Opening, closing, and running the existing export flow still work.
- SPA navigation and header re-renders do not remove or duplicate the trigger.
