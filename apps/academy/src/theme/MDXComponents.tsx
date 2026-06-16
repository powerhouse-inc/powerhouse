import MDXComponents from "@theme-original/MDXComponents";
import Quiz from "@site/src/components/Learn/Quiz";
import Term from "@site/src/components/Learn/Term";
import { Cards, Card } from "@site/src/components/Learn/Cards";

// Make the Learn-section components available in every MDX file without an
// explicit import (mirrors how the Fumadocs source auto-injects them).
export default {
  ...MDXComponents,
  Quiz,
  Term,
  Cards,
  Card,
};
