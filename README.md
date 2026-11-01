# Praksa BPMN Studio

A standalone Vue application for editing FIPU Praksa Models A and B. The editor and SVG renderer are our own code; neither uses `bpmn-js`, the Camunda Modeler, or a Camunda runtime.

## Run

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open <http://localhost:5174>. `npm run build` creates a static site in `dist/`; `npm run preview` serves it on port 4174. The application works independently of the internship dashboard, engine, and connector services. Model files and connector metadata are included in this repository.

## Check

With the development server running, use `npm test` for the XML toolkit, MCP server and editor regression checks. Install test Chromium once with `npx playwright install chromium`, or set `CHROME_PATH` to an existing Chrome executable. `npm run test:model` runs the XML tests without a server. `npm run test:mcp` tests the MCP protocol and file edits in temporary directories without a browser or running stack. UI tests use an isolated browser profile and write ignored screenshots/XML under `.impeccable/review/`.

## UI components

The Vue interface uses Reka UI primitives for tabs, selectors, toolbars, confirmation dialogs, mobile panels, validation popovers, collapsibles and tooltips. The existing FIPU styling and Material Design Icons are retained. See [UI components and accessibility behavior](docs/ui-components.md) for the component map, state handling, source documentation and keyboard checks.

## Edit a model

Choose Model A or Model B, select an element to edit its properties, and use the palette to create supported BPMN elements. Drag nodes to move them, connect nodes with Sequence Flows, and use undo/redo to revise changes. The inspector exposes documentation, connector configuration, input/output mappings, user form fields and gateway conditions. Existing IDs remain stable because the dashboard and saved instances refer to them.

Keyboard shortcuts: Delete or Backspace removes the selected element after confirmation; Ctrl/⌘ Z undoes, Ctrl/⌘ Shift Z or Ctrl Y redoes, and Ctrl/⌘ S saves the active model in this browser. Escape cancels connection mode and closes mobile panels. Arrow keys move a focused node by 10 units (Shift: 1 unit). Deletion and model undo/redo shortcuts leave text fields and other editable controls to their native keyboard behavior.

Import and export use BPMN XML with BPMN Diagram Interchange coordinates. Legacy Camunda extensions are converted to the FIPU namespace on import. Unsupported executable elements are reported and block validated export; they are not silently discarded. Model B's employer-agreement branch ends with its own End Event while the student workflow continues independently.

Use **Spremi** to save the active model, including pending inspector edits. The status distinguishes saved work from unsaved changes. Switching models, importing another file, or refreshing with F5 / Ctrl/⌘ R opens a Reka dialog when changes are unsaved: save and continue, discard back to the last save, or cancel. Browser toolbar refresh and tab closing use the browser's native warning because browsers cannot wait for a custom dialog during `beforeunload`.

Automatic recovery drafts remain separate from explicit saves. Accepting the browser's native reload warning restores applied changes as unsaved; an explicit discard restores the last save. Existing drafts from earlier versions are kept as the initial saved state. If browser storage fails, saving fails and navigation stays blocked until the user cancels or explicitly discards. Invalid inspector JSON also blocks saving; incomplete BPMN graphs can be saved as drafts, while export still requires a valid model.

Saved models and recovery drafts are local to this browser, not server backups or edits to repository files. **Izvezi BPMN** downloads the `.bpmn` file for sharing or applying it to the engine; export is separate from saving. Studio does not execute connectors, send email, or publish workflow changes.

## Edit models with Codex or Claude Code

The local MCP server exposes model inspection, connector guidance, validation, and batch editing of tasks, forms, Sequence Flows and layout. It edits actual `.bpmn`/`.xml` files in a directory you choose. It uses the same XML toolkit and validation as Studio, and can run without the browser app or Docker.

After `npm ci`, start it through your MCP client using `node /absolute/path/to/fipu-bpmn-studio/mcp/server.mjs --models-dir /absolute/path/to/models`. Edits preview by default; saving requires an explicit flag and the revision returned when the agent read the model. See [MCP setup and workflow](docs/mcp.md) for Codex and Claude Code commands, examples, and the Praksa source/snapshot workflow.

## Apply reviewed changes to Praksa

1. Export and review the XML diff, especially task IDs, form field IDs, connector payloads, conditions and flow changes.
2. Replace the corresponding file in `python-bpmn-engine/models/` in the multi-repository `fipu-praksa` workspace.
3. Run `make bpmn-sync`, then `make bpmn-check` from that workspace. This updates the Studio templates and dashboard XML snapshots. It also copies `packages/bpmn/` into the dashboard's `vendor/fipu-bpmn/` package so the dashboard can build independently.
4. Run engine tests and `make dev-test` against the local stack. Review existing instances before any deployment: preserving IDs alone does not make every graph change safe for running instances.

New User Tasks or renamed form fields also require dashboard mappings/forms and possibly connector changes. This editor does not generate application screens. Production rollout remains the responsibility of the existing repositories and infrastructure.

## Structure

- `src/`: standalone editor and inspector.
- `packages/bpmn/`: XML toolkit using standard DOM APIs, and reusable Vue SVG renderer.
- `mcp/`: local stdio MCP server for editing model files with agents.
- `public/models/`: reviewed A/B model snapshots from the engine.
- `public/connectors.json`: connector metadata from `internship-application-services/bpmn/connectors.json`, with no credentials or server URLs.
- `docs/bpmn-profile.md`: supported execution profile and compatibility rules.

The standard notation and interchange vocabulary are defined by [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/). This application implements the documented Praksa subset; it does not claim full BPMN conformance.
