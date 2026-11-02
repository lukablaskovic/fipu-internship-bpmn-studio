# Praksa BPMN Studio

A standalone Vue application for editing FIPU Praksa Models A and B. The editor and SVG renderer are our own code; neither uses `bpmn-js`, the Camunda Modeler, or a Camunda runtime.

## Run

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open <http://localhost:5174>. `npm run build` creates a static site in `dist/`; `npm run preview` serves it on port 4174. The application runs independently of the dashboard and engine processes, but reads the authoritative model files from `../python-bpmn-engine/models/`. Set `BPMN_MODELS_DIR=/absolute/path/to/models` if the directory is elsewhere. The local Vite development/preview server provides the model API; a static-only deployment cannot save models.

## Check

With the development server running, use `npm test` for the XML toolkit, MCP server and editor regression checks. Install test Chromium once with `npx playwright install chromium`, or set `CHROME_PATH` to an existing Chrome executable. `npm run test:model` runs the XML tests without a server. `npm run test:mcp` tests the MCP protocol and file edits in temporary directories without a browser or running stack. UI tests use an isolated browser profile and write ignored screenshots/XML under `.impeccable/review/`.

## UI components

The Vue interface uses Reka UI primitives for tabs, selectors, toolbars, confirmation dialogs, mobile panels, validation popovers, collapsibles and tooltips. The existing FIPU styling and Material Design Icons are retained. See [UI components and accessibility behavior](docs/ui-components.md) for the component map, state handling, source documentation and keyboard checks.

## Edit a model

Choose Model A or Model B, select an element to edit its properties, and use the palette to create supported BPMN elements. Drag nodes to move them, connect nodes with Sequence Flows, and use undo/redo to revise changes. The inspector exposes documentation, connector configuration, input/output mappings, user form fields and gateway conditions. Existing IDs remain stable because the dashboard and saved instances refer to them.

Keyboard shortcuts: Delete or Backspace removes the selected element after confirmation; Ctrl/⌘ Z undoes, Ctrl/⌘ Shift Z or Ctrl Y redoes, and Ctrl/⌘ S saves Model A or B to its authoritative file. Escape cancels connection mode and closes mobile panels. Arrow keys move a focused node by 10 units (Shift: 1 unit). Deletion and model undo/redo shortcuts leave text fields and other editable controls to their native keyboard behavior.

Import and export use BPMN XML with BPMN Diagram Interchange coordinates. Legacy Camunda extensions are converted to the FIPU namespace on import. Unsupported executable elements are reported and block validated export; they are not silently discarded. Model B's employer-agreement branch ends with its own End Event while the student workflow continues independently.

Use **Spremi** to write Model A or B to its authoritative `.bpmn` file, including pending inspector edits. Studio and MCP share validation, revision checks, a per-file lock and atomic replacement. A concurrent agent/editor change rejects a stale save instead of overwriting it. Invalid JSON or BPMN validation errors block saving. New engine instances read the new source; already-running instances keep their in-memory graph.

Switching models, importing, or refreshing with F5 / Ctrl/⌘ R opens a Reka dialog for unsaved changes: save and continue, discard, or cancel. Browser toolbar refresh and closing use the native browser warning. Browser storage is only crash recovery: it never becomes the source of truth for A/B. Clean recovery copies are replaced by a newer source; conflicting unsaved drafts require explicit recovery and cannot overwrite a newer file without reloading/reviewing it. Export can rescue a conflicting draft.

Imported files remain optional browser-only scratch drafts (the button says **Spremi skicu**); they do not create a third authoritative file or overwrite A/B. **Izvezi BPMN** remains a validated download. Saving A/B no longer requires exporting and copying files. Studio never calls workflow connectors or deploys production services.

The authoring endpoint accepts only A/B filenames, validates XML server-side, rejects symlinks and stale revisions, and only accepts localhost/loopback hosts with same-origin JSON writes. Keep it local; it is not a publicly authenticated authoring service. In Docker the engine directory is mounted read-only in the engine and read/write in Studio.

## Edit models with Codex or Claude Code

The local MCP server exposes model inspection, connector guidance, validation, and batch editing of tasks, forms, Sequence Flows and layout. It edits actual `.bpmn`/`.xml` files in a directory you choose. It uses the same XML toolkit and validation as Studio, and can run without the browser app or Docker.

After `npm ci`, start it through your MCP client using `node /absolute/path/to/fipu-bpmn-studio/mcp/server.mjs --models-dir /absolute/path/to/models`. Edits preview by default; saving requires an explicit flag and the revision returned when the agent read the model. See [MCP setup and workflow](docs/mcp.md) for Codex and Claude Code commands, examples, and the Praksa source/snapshot workflow.

## Single model source

Only `python-bpmn-engine/models/strucna_praksa_A.bpmn` and `strucna_praksa_B.bpmn` are authoritative. Studio's local `/api/models/<filename>` reads/writes that directory; MCP is configured with the same directory. The dashboard reads the engine's `GET /model/<filename>` endpoint. No model files are bundled in either browser app.

`make bpmn-check` checks that exactly A/B exist, no UI model copies remain, and connector/renderer snapshots match. `make bpmn-sync` only copies the connector catalog and shared renderer, never models. Run local workflow tests after graph/connector changes. Task/form IDs still require dashboard compatibility. Restart recovery uses current model files, so graph changes affecting existing instances still require compatibility review; this change adds no instance migration or production rollout.

Tests read A/B from the same directory (override `BPMN_MODELS_DIR` when needed). Browser regressions use isolated in-memory API responses, and file-writing tests use temporary directories; they do not modify the real models.

## Structure

- `src/`: standalone editor and inspector.
- `packages/bpmn/`: XML toolkit using standard DOM APIs, and reusable Vue SVG renderer.
- `mcp/`: local stdio MCP server for editing model files with agents.
- `model-api.mjs`, `model-store.mjs`: local authoring API and file store shared with MCP.
- `public/connectors.json`: connector metadata from `internship-application-services/bpmn/connectors.json`, with no credentials or server URLs.
- `docs/bpmn-profile.md`: supported execution profile and compatibility rules.

The standard notation and interchange vocabulary are defined by [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/). This application implements the documented Praksa subset; it does not claim full BPMN conformance.
