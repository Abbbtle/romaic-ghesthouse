import { Fragment } from "react";
import { paragraphsOf } from "./text-blocks";

type ParagraphsProps = {
  /** Text as content keeps it: paragraphs split by a blank line, line breaks kept within one. */
  text: string;
  /** Type and colour for every paragraph. */
  className?: string;
};

/**
 * Plain text that may run over several lines, such as a description, as
 * paragraphs 16 px apart with their line breaks. Always text, never markup.
 */
export function Paragraphs({ text, className }: ParagraphsProps) {
  return (
    <div className="grid gap-4">
      {paragraphsOf(text).map((lines, index) => (
        // The paragraphs are the text's own, in order; their place is their identity.
        <p key={index} className={className}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
