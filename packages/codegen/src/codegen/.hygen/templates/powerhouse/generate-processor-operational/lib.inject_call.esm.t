---
inject: true
to: "<%= rootDir %>/factory.ts"
after: "  // Add other processors here as they are generated"
skip_if: "...<%=h.changeCase.camel(name) %>ProcessorFactory(module)(driveId)"
---
  processors.push(...<%= h.changeCase.camel(name) %>ProcessorFactory(module)(driveId));