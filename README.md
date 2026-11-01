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

With the development server running, use `npm test` for the XML toolkit and editor regression checks. Install test Chromium once with `npx playwright install chromium`, or set `CHROME_PATH` to an existing Chrome executable. `npm run test:model` runs the XML tests without a server. UI tests use an isolated browser profile and write ignored screenshots/XML under `.impeccable/review/`.

## Edit a model

Choose Model A or Model B, select an element to edit its properties, and use the palette to create supported BPMN elements. Drag nodes to move them, connect nodes with Sequence Flows, and use undo/redo to revise changes. The inspector exposes documentation, connector configuration, input/output mappings, user form fields and gateway conditions. Existing IDs remain stable because the dashboard and saved instances refer to them.

Import and export use BPMN XML with BPMN Diagram Interchange coordinates. Legacy Camunda extensions are converted to the FIPU namespace on import. Unsupported executable elements are reported and block validated export; they are not silently discarded. The included Model B has a pre-existing disconnected placeholder task, reported as a warning.

Drafts are stored locally in the browser. They are not server backups. Export the `.bpmn` file to retain or share your work. Studio does not execute connectors, send email, or publish workflow changes.

## Apply reviewed changes to Praksa

1. Export and review the XML diff, especially task IDs, form field IDs, connector payloads, conditions and flow changes.
2. Replace the corresponding file in `python-bpmn-engine/models/` in the multi-repository `fipu-praksa` workspace.
3. Run `make bpmn-sync`, then `make bpmn-check` from that workspace. This updates the Studio templates and dashboard XML snapshots. It also copies `packages/bpmn/` into the dashboard's `vendor/fipu-bpmn/` package so the dashboard can build independently.
4. Run engine tests and `make dev-test` against the local stack. Review existing instances before any deployment: preserving IDs alone does not make every graph change safe for running instances.

New User Tasks or renamed form fields also require dashboard mappings/forms and possibly connector changes. This editor does not generate application screens. Production rollout remains the responsibility of the existing repositories and infrastructure.

## Structure

- `src/`: standalone editor and inspector.
- `packages/bpmn/`: dependency-free XML toolkit and reusable Vue SVG renderer.
- `public/models/`: reviewed A/B model snapshots from the engine.
- `public/connectors.json`: connector metadata from `internship-application-services/bpmn/connectors.json`, with no credentials or server URLs.
- `docs/bpmn-profile.md`: supported execution profile and compatibility rules.

The standard notation and interchange vocabulary are defined by [OMG BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/). This application implements the documented Praksa subset; it does not claim full BPMN conformance.
