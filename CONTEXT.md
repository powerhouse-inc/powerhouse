# Powerhouse document models

Vocabulary for document model authoring and stored document model definitions.

## Language

**Document model specification**:
A complete versioned definition of a document model, including its scoped state specifications,
modules, operations, and change history.
_Avoid_: State configuration

**Scoped state specification**:
The schema and initial value for one document scope. In code-first definitions, the schema value is a
root object descriptor whose references materialize the complete stored schema. A local scope may
explicitly have no schema.
_Avoid_: State, when referring to the schema and initial value together
