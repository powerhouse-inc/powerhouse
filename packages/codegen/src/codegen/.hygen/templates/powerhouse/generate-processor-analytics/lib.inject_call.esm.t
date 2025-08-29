---
inject: true
to: "<%= rootDir %>/factory.ts"
after: "  // Add processors here as they are generated"
skip_if: "<%= h.changeCase.pascal(name) %>ProcessorFactory"
---
  factories.push(<%= h.changeCase.pascal(name) %>ProcessorFactory(module));