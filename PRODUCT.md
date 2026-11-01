# Product

## Platform

Web application in a standalone public repository, separate from the internship dashboard.

## Users and purpose

Requested for the maintainers of FIPU Praksa to author the two internship workflows, Model A and Model B, without requiring Camunda or bpmn.io. The interface should fit the existing FIPU application and make the supported model and connector settings easier to edit.

## Constraints

Use BPMN nomenclature, standard XML and diagram coordinates. Preserve task IDs, form IDs, connector contracts and compatibility with existing engine instances. Support the subset used by the two workflows. Do not include credentials, student records or live connector execution in the browser app. Keep the editor independently runnable.

## Implementation decisions

Vue reuses the surrounding application's framework. Native XML and SVG APIs provide the model and diagram editing. Changes are reviewed and exported as files; there is no model deployment endpoint. These are implementation choices, not a claim that an authenticated multi-user hosting service has been requested or delivered.
