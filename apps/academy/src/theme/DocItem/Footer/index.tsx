import React from "react";
import type { JSX } from "react";
import Footer from "@theme-original/DocItem/Footer";
import type FooterType from "@theme/DocItem/Footer";
import type { WrapperProps } from "@docusaurus/types";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import LessonFooter from "@site/src/components/Learn/LessonFooter";
import { isLearnLesson } from "@site/src/components/Learn/courseData";

type Props = WrapperProps<typeof FooterType>;

/**
 * Wraps the default doc footer. On Learn-track lessons it prepends the
 * "mark complete & continue" controls; every other doc renders unchanged.
 */
export default function FooterWrapper(props: Props): JSX.Element {
  const { metadata } = useDoc();
  const showLessonFooter = isLearnLesson(metadata.id);

  return (
    <>
      {showLessonFooter && <LessonFooter docId={metadata.id} />}
      <Footer {...props} />
    </>
  );
}
