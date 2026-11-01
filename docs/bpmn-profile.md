# Praksa BPMN execution profile, version 1

Standard BPMN elements retain the OMG namespace `http://www.omg.org/spec/BPMN/20100524/MODEL`. Layout uses BPMNDI, DC and DI namespaces. The profile supports one executable Process, one Pool, Lanes, Start Event, End Event, Task, Manual Task, User Task, Service Task, Send Task, Exclusive Gateway, Parallel Gateway, and Sequence Flow. It is a subset of BPMN 2.0.2, not a separate diagram language.

Execution extensions live under `bpmn:extensionElements` in `urn:fipu:bpmn:1`. XML namespace URIs determine their meaning; the prefix need not be `fipu`. Existing extension names and values are retained so migration does not change the wire contract:

```xml
<bpmn:serviceTask id="spremanje_dnevnika" name="Spremanje dnevnika">
  <bpmn:extensionElements>
    <fipu:connector>
      <fipu:connectorId>baserow</fipu:connectorId>
      <fipu:inputOutput>
        <fipu:inputParameter name="method">POST</fipu:inputParameter>
        <fipu:inputParameter name="url">/api/dnevnik</fipu:inputParameter>
      </fipu:inputOutput>
    </fipu:connector>
    <fipu:inputOutput>
      <fipu:inputParameter name="JMBAG">${JMBAG}</fipu:inputParameter>
      <fipu:outputParameter name="id_dnevnik_prakse" />
    </fipu:inputOutput>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

This is an extension fragment; enclosing definitions declare the namespaces. Connector inputs specify `method`, relative `url`, and optional `url_parameter` map. Supported methods are GET, POST and PATCH. Connector IDs (`baserow`, `sendgrid`, `pdf`) resolve to server-side configuration in the engine. They do not contain deployment URLs or authentication secrets. `sendgrid` is the stable historical ID for the current EmailJS service.

Task-level `inputOutput` contains request body values and response-field output declarations. Values can be text, a `list` of `value` children, or a `map` of `entry key="..."` children. The engine interpolates `${variable}` references using its existing rules. Output names select top-level response fields. This profile does not add expression languages or scripting.

User Task `formData` contains `formField` elements with `id`, `type` and optional `label`. Properties use `properties/property` with `id` and `value`; validation uses `validation/constraint` with `name` and `config`. Unknown form types may not have dashboard controls; the existing dashboard remains the authority for form presentation.

Sequence Flow conditions retain the engine's `variable:value` string-equality syntax. This is not FEEL or a full expression evaluator. Branches from an Exclusive Gateway should be mutually exclusive. Existing process IDs, task IDs, field IDs and flow IDs must be preserved during migration.

Exclusive Gateways select the first matching outgoing flow and use the default only if none matches. Normal End Events consume their own token; other branches continue. Cycles that revisit a Parallel Gateway are rejected by Studio because the current engine does not reset join tokens for another iteration. The existing Model A rejection loop remains supported because it precedes its parallel gateways.

The engine still reads legacy `http://camunda.org/schema/1.0/bpmn` extensions for compatibility. Studio emits FIPU extensions and removes Camunda modeler metadata. Optional legacy DI color annotations are retained as inert XML metadata; they are not a runtime dependency. Unknown XML metadata is preserved, while unsupported executable elements prevent validated export.

The editor's validation checks the supported structure and connector configuration; it does not prove the business process is sound, that every branch can complete, or that existing instances can safely use a changed graph. Review and run local workflow tests before release.
