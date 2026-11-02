# Studio UI primitives

The Studio uses Vue 3 and **Reka UI 2.11.0**, pinned in `package.json`. Reka supplies unstyled interaction primitives; `src/style.css` owns the existing FIPU cyan/navy appearance and Material Design Icons remain in `src/Icon.vue`.

## Component map

| Studio control | Reka primitives | Behavior |
| --- | --- | --- |
| Model A/B/imported-draft tabs | `TabsRoot`, `TabsList`, `TabsTrigger`, `TabsContent` | Controlled selection, manual keyboard activation, labeled tab panel; model switches still run unsaved-edit guards |
| Action buttons | `Primitive` through `StudioButton` | Native button semantics and submit types; shared attribute/ref forwarding supports composition with other primitives |
| Icon/action help | `TooltipProvider`, `TooltipRoot`, `TooltipTrigger`, `TooltipPortal`, `TooltipContent` | Keyboard and pointer tooltips with shared delay; titles never replace accessible button names |
| Editing and zoom controls | `ToolbarRoot`, `ToolbarButton`, `ToolbarSeparator` | Arrow-key navigation and a single tab stop per toolbar; disabled undo/redo controls are excluded |
| Connect mode | controlled `Toggle` | Pressed state tracks the application, including Escape cancellation |
| Inspector selectors | `Label`, `SelectRoot`, `SelectTrigger`, `SelectValue`, `SelectIcon`, `SelectContent`, `SelectViewport`, `SelectItem`, `SelectItemText`, `SelectItemIndicator`, `SelectPortal` | Keyboard navigation, typeahead, selected indicators, positioning and focus restoration |
| Text fields and file picker | `Label` and `Primitive as-child` around native inputs/textarea | Native caret, selection, input events, IME and file-picker behavior; Vue's native `v-model` stays on the actual control |
| Form-field advanced settings | `CollapsibleRoot`, `CollapsibleTrigger`, `CollapsibleContent` | Keyboard activation and expanded-state semantics |
| Validation results | `PopoverRoot`, `PopoverTrigger`, `PopoverPortal`, `PopoverContent`, `PopoverClose` | Anchored results, outside/Escape dismissal and focus return to validation trigger |
| Mobile library/inspector | `DialogRoot`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogTitle`, `DialogClose` | Modal focus containment, background exclusion, Escape dismissal and focus return to the library opener |
| Delete/discard/import replacement | `AlertDialogRoot`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogContent`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogCancel`, `AlertDialogAction` | Explicit confirmation, default cancel focus, trapped tab navigation and safe cancellation |

Static layout, headings, live error/status messages, and BPMN SVG notation remain semantic HTML/SVG. Reka does not provide a BPMN renderer. The reusable `packages/bpmn/` package and MCP server do not depend on Reka.

## Controlled state and data protection

`StudioConfirm.ask()` resolves a promise instead of blocking the browser with `window.confirm`. All callers await it before switching models, discarding inspector edits, replacing imports, deleting elements, or applying guarded history/navigation actions. Confirmation is resolved during the action's capture phase so the primitive's close notification cannot turn acceptance into cancellation. The browser's native `beforeunload` protection remains for closing/reloading with unsaved work.

`Spremi` / Ctrl/⌘ S applies pending inspector edits and PUTs A/B to the local model API with the source revision. The API validates the model and atomically updates the same file used by MCP and the engine. Only a successful response updates the saved checkpoint. Browser storage is recovery only. Stale revisions, invalid models and failed writes keep the model unsaved and block guarded navigation. Imported scratch drafts remain browser-local and use **Spremi skicu**.

Model switching, imports and refresh shortcuts share the unsaved-changes AlertDialog. Cancel preserves edits, save-and-continue waits for the source write, and discard restores the loaded source checkpoint. Browser toolbar refresh, tab closing and external navigation use `beforeunload` because they cannot wait for an asynchronous dialog ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)).

Model tabs use manual activation: arrow keys move focus, and Enter/Space activates a model after its guards complete. An unsuccessful/cancelled switch leaves the current tab and model selected. The shared editor is the active tab panel, rather than mounting separate copies of each model editor.

`StudioSelect` maps option indices to Reka item values. This allows the application to keep `''` for “Bez staze” and “Bez zadanog toka”; Reka forbids an empty string as a SelectItem value. The mapping exists only in the UI and never changes BPMN IDs or persisted values. Unknown imported connector/form types remain visible as options rather than being silently replaced. Known-operation selection applies the selected method/path without submitting the inspector form.

Editing shortcuts ignore active dialogs and listboxes, editable controls, IME composition, repeated key events and events already handled by a primitive. Save also works from inspector fields, including mobile dialogs; refresh shortcuts run the unsaved-changes guard. Delete/Backspace still require confirmation; native text editing and selection remain intact. Reka handles dialog Escape and nested select Escape, so closing a selector does not close its parent inspector.

On desktop, `StudioPanel` renders an ordinary aside. At 1000px and below it renders a modal Dialog. Panel drafts remain in the parent's reactive inspector state across breakpoint changes. When moving from the library into the inspector, closing the library does not steal focus from the newly opened inspector.

## Styling and portals

The existing global tokens style the primitives and their `data-state`/`data-highlighted` attributes. Selects and tooltips portal to the body to avoid clipping inside scrollable panels. Layers are ordered: mobile backdrop/panel, validation popover, select, confirmation backdrop/dialog, tooltip. Select content is constrained by Reka's available-height/trigger-width variables. Modal panels fit narrow screens without horizontal document overflow.

## Validation

`npm run test:ui` runs the existing editor regressions, `tests/save.spec.mjs` and `tests/reka.spec.mjs`. They cover save/reload/discard and storage failures, tab keyboard activation, cancelled/accepted unsaved changes, empty-value selects, method/operation selection, toolbar focus navigation, connect Toggle state, tooltips, collapsibles, nested mobile selectors, modal focus containment, Escape handling and focus restoration. Screenshots go to the ignored `.impeccable/review/` directory. Use `CHROME_PATH` if Playwright Chromium is not installed.

The browser suite checks application-level behavior and accessibility semantics; it is not a manual screen-reader certification. Run `npm test` and `npm run build` for the complete Studio checks.

## Documentation consulted

- [Reka introduction and design principles](https://reka-ui.com/docs/overview/introduction)
- [Composition / asChild](https://reka-ui.com/docs/guides/composition) and [Primitive](https://reka-ui.com/docs/utilities/primitive)
- [Tabs](https://reka-ui.com/docs/components/tabs), [Toolbar](https://reka-ui.com/docs/components/toolbar), [Toggle](https://reka-ui.com/docs/components/toggle)
- [Select](https://reka-ui.com/docs/components/select) and [Label](https://reka-ui.com/docs/components/label)
- [Alert Dialog](https://reka-ui.com/docs/components/alert-dialog), [Dialog](https://reka-ui.com/docs/components/dialog), [Popover](https://reka-ui.com/docs/components/popover)
- [Tooltip](https://reka-ui.com/docs/components/tooltip) and [Collapsible](https://reka-ui.com/docs/components/collapsible)

Where the live docs cover a newer API, the installed 2.11.0 source is the implementation authority (for example, Toggle uses `modelValue` / `update:modelValue`).
