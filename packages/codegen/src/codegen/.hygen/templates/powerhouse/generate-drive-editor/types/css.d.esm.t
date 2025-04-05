---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/types/css.d.ts"
unless_exists: true
---
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
} 