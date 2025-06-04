# Authentication and Authorization

## Authentication

Authentication is already handled by the Renown service and will not be discussed here. Suffice it to say, that the reactor package will not be responsible for authentication.

## Authorization

We use a layered approach for authorization.

### GQL

GQL authorization will be handled by the container application, like Switchboard. This can be done using standard middleware authorization practices.

Apollo Server, for example, outlines a standard authorization approach [here](https://www.apollographql.com/docs/apollo-server/security/authentication#authorization-methods).

### Document Access

> TODO: Spell out how authorization will work for document access.

### Scopes and Operations

> TODO: Spell out how authorization will work for scope access and operation application
