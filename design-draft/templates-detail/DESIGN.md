# Template Detail — Design Notes

## Ignore (fabricated)
- "Pipeline Preview" animated node graph — pure decoration, no backend data needed

## Partial support
- "Resources Used" model usage count — data available in steps->actions->model, frontend must compute client-side
- "+Add Orchestration Step" — use PUT /templates to update entire steps array, no dedicated add-step endpoint

## Fully supported
- Template name, description, execution mode, step list with action names/models, template info (created, updated, step count), edit/delete buttons
