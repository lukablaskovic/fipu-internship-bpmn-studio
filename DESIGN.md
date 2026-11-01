# Praksa BPMN Studio

The editor inherits the FIPU application's cyan and navy identity. This is a task-oriented modelling workspace: the diagram is the primary artifact, standard BPMN notation stays legible, and execution configuration remains visible alongside the selected element.

## Tokens

- Canvas: `#f4f7fa`; surface: `#ffffff`; header: `#172234`.
- Primary action: `#087caa` with white text; FIPU cyan: `#46bae0` for the logo and active model marker.
- Text: `#23374c`; secondary text: `#5b6f81`; dividers: `#dce4eb`.
- System UI sans-serif for labels, native monospace only for XML identifiers and JSON values. Base size 13px, heading 17px, inspector labels 11px.
- Controls use 5–6px corners, panels use separators, and the SVG uses BPMN task, event and gateway shapes.
- Focus rings: 3px `#79d4f2`, offset 2px. Reduced motion disables control transitions.

## Workspace

A navy identity bar precedes A/B model tabs and file actions. The desktop workspace uses a 232px library, a flexible SVG canvas, and a 300px inspector. Below 1000px the library and inspector become dismissible overlays. The canvas supports pan/zoom and keyboard selection; arrow keys move editable nodes. Model XML uses existing task IDs and preserves lanes and diagram positions.

The inspector separates descriptive fields, connector settings, variable mapping, and user form fields. Edits apply explicitly as one undo step. Import, export, validation, local draft status, and errors use ordinary controls and readable text. No remote deployment or connector execution is exposed.


## Icons and copy

Controls, the brand mark, palette task pictograms and diagram task pictograms use named imports from Material Design Icons (`@mdi/js`). BPMN events, gateways, task boundaries and sequence-flow notation remain geometric SVG/CSS shapes.

Keep persistent copy focused on model selection, editing controls, validation and meaningful draft status. Omit environment badges, repeated introductions, decorative empty-state sketches and permanent export disclaimers. Empty selection needs one short instruction; errors and task-ID compatibility guidance remain visible when relevant.
