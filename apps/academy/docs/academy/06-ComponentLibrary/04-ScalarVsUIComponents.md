import { Tabs, TabItem } from '@theme/Tabs';

# Scalar vs. UI component

Scalars are here to help you define custom fields in your document model schema and speed up the development process.
There are two applications of scalar components in the document model workflow:

1. At the **schema definition** level where you build your schema and write your GraphQL state schema.
2. At the **frontend / react** level where you import it and place it in your UI to represent the scalar field

## Overview
The Document Engineering library provides two main categories of components.

https://github.com/powerhouse-inc/document-engineering

### Scalar Components

These are specialized form components, each corresponding to a GraphQL scalar type (e.g., String, Number, Boolean, Currency, PHID). They are built on top of react-hook-form, offering out-of-the-box validation but must be wrapped with a Form component in order to work properly.

Location: @powerhousedao/document-engineering/scalars

**Key Feature**: Must be used within a Form component provided by this library.

### General-Purpose UI Components

This category includes a broader range of UI elements such as simplified versions of the Scalar components (which don't require a Form wrapper but lack built-in validation), as well as other versatile components like Dropdown, Tooltip, Sidebar, ObjectSetTable and more. These are designed for crafting diverse and complex user interfaces.

Location: @powerhousedao/document-engineering/ui
