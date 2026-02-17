# Shared code for the Powerhouse monorepo

This directory is an npm package which is intended for sharing code across packages in the monorepo.

This package should **never depend on any other package in this monorepo**. We want to be able to use the code kept here in any of the other monorepo packages without circular imports.

This is a great place to put your:

- simple constants you want to be able to use anywhere
- base types you want to share easily (**not** derived types that require imports from elsewhere)
- simple utility functions that **do not depend on code from elsewhere in the monorepo**