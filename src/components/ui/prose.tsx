import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { MarkdownBlock, MarkdownHeadingLevel, MarkdownInline } from "@/lib/content/markdown";
import { cx } from "./cx";
import { ExternalLink } from "./external-link";
import { linkClasses } from "./text-link";

/**
 * Site pages and anchors navigate in place, other websites open a new tab,
 * and mailto: and tel: hand over to the device. The parser has already
 * dropped any address it doesn't allow (src/lib/content/markdown.ts).
 */
function ProseLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={linkClasses()}>
        {children}
      </Link>
    );
  }
  if (/^https:/i.test(href)) return <ExternalLink href={href}>{children}</ExternalLink>;
  return (
    <a href={href} className={linkClasses()}>
      {children}
    </a>
  );
}

function renderInline(nodes: readonly MarkdownInline[]): ReactNode {
  // Inline nodes have no identity beyond their place in the text.
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "break":
        return <br key={index} />;
      case "strong":
        return (
          <strong key={index} className="font-bold">
            {renderInline(node.children)}
          </strong>
        );
      case "emphasis":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        return (
          <ProseLink key={index} href={node.href}>
            {renderInline(node.children)}
          </ProseLink>
        );
    }
  });
}

/**
 * page: a page of text on the public site (the privacy notice), drawn by the
 * site theme's .prose rules. base: the same outside the site's theme (the kit).
 * sm: small print beside a form (the booking consent notice).
 */
export type ProseSize = "page" | "base" | "sm";

type ProseLook = { frame: string; gap: string; list: string; item: string; headings: Record<MarkdownHeadingLevel, string> };

const utilityList = "space-y-2 pl-5 first:mt-0 marker:text-gold-text";

const looks: Record<ProseSize, ProseLook> = {
  page: {
    frame: "prose",
    gap: "",
    list: "prose__list",
    item: "",
    headings: { 2: "h3", 3: "prose__h3", 4: "prose__h4" },
  },
  base: {
    frame: "max-w-[65ch] text-base text-fg",
    gap: "mt-4",
    list: utilityList,
    item: "pl-1",
    headings: {
      2: "mt-10 text-h3 font-bold text-ink font-stretch-semi-expanded",
      3: "mt-8 text-h4 font-bold text-ink font-stretch-semi-expanded",
      4: "mt-6 text-base font-bold text-ink",
    },
  },
  sm: {
    frame: "text-sm text-fg-2",
    gap: "mt-2",
    list: utilityList,
    item: "pl-1",
    headings: {
      2: "mt-4 text-sm font-bold text-fg",
      3: "mt-3 text-sm font-bold text-fg",
      4: "mt-3 text-sm font-medium text-fg",
    },
  },
};

const headingTags = { 2: "h2", 3: "h3", 4: "h4" } as const;

function renderBlock(block: MarkdownBlock, index: number, look: ProseLook): ReactNode {
  switch (block.type) {
    case "heading": {
      const Heading = headingTags[block.level];
      return (
        <Heading key={index} className={cx(look.headings[block.level], look.gap && "first:mt-0")}>
          {renderInline(block.children)}
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p key={index} className={cx(look.gap, look.gap && "first:mt-0") || undefined}>
          {renderInline(block.children)}
        </p>
      );
    case "list": {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex} className={look.item || undefined}>
          {renderInline(item)}
        </li>
      ));
      const listClasses = cx(look.gap, look.list, look.list === utilityList && (block.ordered ? "list-decimal" : "list-disc"));
      return block.ordered ? (
        <ol key={index} start={block.start} className={listClasses}>
          {items}
        </ol>
      ) : (
        // role="list" keeps the list a list for VoiceOver once the page look styles its bullets away.
        <ul key={index} role="list" className={listClasses}>
          {items}
        </ul>
      );
    }
  }
}

type ProseProps = {
  /**
   * Limited Markdown parsed by the content core, e.g.
   * `parseMarkdown(privacy.body, siteFacts(site))`. Text is always rendered
   * as text, never as HTML.
   */
  blocks: readonly MarkdownBlock[];
  size?: ProseSize;
  className?: string;
};

/**
 * Legal and policy text from content: headings, paragraphs with their line
 * breaks, lists, bold, italic and links, as ordinary elements. Headings
 * start at h2, under the page's own h1.
 */
export function Prose({ blocks, size = "base", className }: ProseProps) {
  const look = looks[size];
  return <div className={cx(look.frame, className)}>{blocks.map((block, index) => renderBlock(block, index, look))}</div>;
}
