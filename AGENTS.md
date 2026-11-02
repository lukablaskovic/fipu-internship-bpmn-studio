# Working on Praksa BPMN Studio

- Use Ponytail on full for coding. Do not commit; finish with a proposed conventional commit message.
- Inspect Git status and preserve unrelated changes before editing.
- This is a standalone editor, not an internship dashboard route. Keep it independently runnable.
- Reuse `packages/bpmn/model.js` for XML editing and `packages/bpmn/BpmnDiagram.vue` for SVG rendering. Never silently drop unknown XML or bypass export validation.
- Preserve BPMN task IDs, form IDs, connectors and diagram data. Read `docs/bpmn-profile.md` before changing the execution contract.
- Keep credentials, server URLs and student records out of the bundled model/catalog files and logs.
- Run `npm run build`, `npm run test:model` and relevant UI checks (`npm run test:ui` with the local server running). Browser tests require Playwright Chromium or `CHROME_PATH`.
- In the multi-repository workspace, run `make bpmn-sync` and `make bpmn-check` after shared toolkit/renderer changes. The dashboard owns a generated vendor snapshot; edit the Studio source.
- Engine changes belong in `python-bpmn-engine`; connector catalog changes belong in `internship-application-services/bpmn/connectors.json`. Studio saves the two authoritative files through its local model API; it must not invoke connectors or deploy production services.
- `mcp/server.mjs` edits model files through the shared toolkit; keep its preview, revision, path and validation checks and reuse model-store.mjs for file writes. Test changes with `npm run test:mcp` using temporary model copies. See `docs/mcp.md` for agent setup and the owning engine model directory.
