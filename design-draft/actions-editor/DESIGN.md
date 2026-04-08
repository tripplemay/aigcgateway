# Action Editor — Design Notes

## Partial support (all handleable on frontend)
- Model dropdown — backend accepts any string for model. Frontend should fetch model list from /v1/models to populate dropdown.
- Variable required/defaultValue — stored in unstructured Json blob, no schema-level validation. Frontend manages the structure.
- Auto-detected variables from `{{variable}}` syntax — pure frontend parsing, backend stores whatever is sent.

## Fully supported
- Action name, description, model selection, messages editor, changelog, save/cancel
