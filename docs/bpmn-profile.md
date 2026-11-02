# Praksa BPMN execution profile, version 1

Standard BPMN elements retain the OMG namespace `http://www.omg.org/spec/BPMN/20100524/MODEL`. Layout uses BPMNDI, DC and DI namespaces. The profile supports one executable Process, one Pool, Lanes, Start Event, Intermediate Message Catch, Timer Catch and None Throw Events, End Event (normal or terminate), Task, Manual Task, User Task, Service Task, Send Task, Exclusive Gateway, Parallel Gateway, and Sequence Flow. It is a subset of BPMN 2.0.2, not a separate diagram language.

Collaboration Message Flows are diagram annotations. Studio can reshape their dashed arrows, but they do not route execution or deliver messages.

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

This is an extension fragment; enclosing definitions declare the namespaces. Connector inputs specify `method`, relative `url`, and optional `url_parameter` map. Supported methods are GET, POST and PATCH. Connector IDs (`baserow`, `emailjs`, `pdf`) resolve to server-side configuration in the engine. They do not contain deployment URLs or authentication secrets. Older exported models and browser drafts must select the EmailJS connector before validation or execution.

Task-level `inputOutput` contains request body values and response-field output declarations. Values can be text, a `list` of `value` children, or a `map` of `entry key="..."` children. The engine interpolates `${variable}` references using its existing rules. Output names select top-level response fields. This profile does not add expression languages or scripting.

User Task `formData` contains `formField` elements with `id`, `type` and optional `label`. Properties use `properties/property` with `id` and `value`; validation uses `validation/constraint` with `name` and `config`. Unknown form types may not have dashboard controls; the existing dashboard remains the authority for form presentation.

Sequence Flow conditions retain the engine's `variable:value` string-equality syntax. This is not FEEL or a full expression evaluator. Branches from an Exclusive Gateway should be mutually exclusive. Existing process IDs, task IDs, field IDs and flow IDs must be preserved during migration.

Exclusive Gateways select the first matching outgoing flow and use the default only if none matches. Normal End Events consume their own token; other branches continue. Cycles that revisit a Parallel Gateway are rejected by Studio because the current engine does not reset join tokens for another iteration. The existing Model A rejection loop remains supported because it precedes its parallel gateways.

The engine and Studio accept only the FIPU execution profile. Optional legacy DI color annotations are retained as inert XML metadata; they are not a runtime dependency. Unknown XML metadata is preserved, while unsupported executable elements prevent validated export.

The editor's validation checks the supported structure and connector configuration; it does not prove the business process is sound, that every branch can complete, or that existing instances can safely use a changed graph. Review and run local workflow tests before release.

## Withdrawal and termination

Models A and B lead from Start to an explicit Parallel Gateway (AND split), which activates the ordinary internship flow and a waiting message catch event, `odustajanje_od_prakse`, in the student lane. `POST /instance/{id}/event/odustajanje_od_prakse` with `{}` durably submits that message. The model then runs `evidentiranje_odustajanja` through Baserow `/api/odustajanje`, followed by `end_event_odustajanje`. This is an explicit parallel BPMN branch, not an interrupting event subprocess. No ordinary task/form IDs change.

`bpmn:messageEventDefinition` makes an Intermediate Catch Event wait for its message. Catch events are returned as `available_events` separately from pending tasks, preserving the dashboard's first-task contract. Accepted message requests block further forms. Connector failure leaves the process stopped; repeating the same event request retries from the durable checkpoint. Events and all existing documents/records remain intact.

A `bpmn:terminateEventDefinition` clears every remaining token. An optional `fipu:outcome="cancelled"` on a terminate end event records withdrawal; its default outcome is `finished`. Normal successful internship completion also terminates the unused message-waiting branch. Other normal end events still complete only their own branch.

After an engine restart, unfinished historical checkpoints acquire message subscriptions reachable from Start through initial parallel splits. Completed instances remain completed and readable. Already-running in-memory graphs require an engine restart to acquire the new branch. Saving models in Studio alone does not restart or deploy the engine.

Intermediate message catches wait for the existing authenticated instance/event-ID endpoint (empty JSON). Timer catches wait for a literal positive duration in seconds, minutes, hours or days, e.g. PT30S, PT15M, PT2H or P1D (one unit, up to seven digits). Restart restores the deadline from the checkpoint that activated the timer. A none throw marks a step in execution history and immediately continues.
