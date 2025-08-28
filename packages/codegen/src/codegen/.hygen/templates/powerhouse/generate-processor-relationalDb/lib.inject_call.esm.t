---
inject: true
to: "<%= rootDir %>/factory.ts"
after: "  // Add processors here as they are generated"
skip_if: "<%=h.changeCase.camel(name) %>ProcessorFactory(module)"
---
  factories.push(<%= h.changeCase.camel(name) %>ProcessorFactory(module));