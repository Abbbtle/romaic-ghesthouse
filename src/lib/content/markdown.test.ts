import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedHref, markdownProblems, parseMarkdown, type MarkdownBlock, type MarkdownInline } from "./markdown";

const text = (value: string): MarkdownInline => ({ type: "text", text: value });
const strong = (...children: MarkdownInline[]): MarkdownInline => ({ type: "strong", children });
const emphasis = (...children: MarkdownInline[]): MarkdownInline => ({ type: "emphasis", children });
const link = (href: string, ...children: MarkdownInline[]): MarkdownInline => ({ type: "link", href, children });
const lineBreak: MarkdownInline = { type: "break" };
const paragraph = (...children: MarkdownInline[]): MarkdownBlock => ({ type: "paragraph", children });

/** The inline content of a one-paragraph text. */
function inline(source: string, values?: Record<string, string>): MarkdownInline[] {
  const blocks = parseMarkdown(source, values);
  assert.equal(blocks.length, 1, source);
  const [block] = blocks;
  assert.ok(block?.type === "paragraph", source);
  return block.children;
}

describe("parseMarkdown: blocks", () => {
  it("reads headings, paragraphs with their line breaks, and both kinds of list", () => {
    const source = [
      "## Who we are",
      "Romaic Guesthouse",
      "286 Stateway",
      "",
      "### Your rights",
      "- see your details",
      "* correct them",
      "+ delete them",
      "1. Email us",
      "2) Or WhatsApp",
      "",
      "#### Complaints",
      "Write to the Regulator.",
    ].join("\n");
    assert.deepEqual(parseMarkdown(source), [
      { type: "heading", level: 2, children: [text("Who we are")] },
      paragraph(text("Romaic Guesthouse"), lineBreak, text("286 Stateway")),
      { type: "heading", level: 3, children: [text("Your rights")] },
      { type: "list", ordered: false, items: [[text("see your details")], [text("correct them")], [text("delete them")]] },
      { type: "list", ordered: true, start: 1, items: [[text("Email us")], [text("Or WhatsApp")]] },
      { type: "heading", level: 4, children: [text("Complaints")] },
      paragraph(text("Write to the Regulator.")),
    ]);
  });

  it("keeps the page's own title the only h1, and stops at level 4", () => {
    assert.deepEqual(parseMarkdown("# Top\n##### Deep ##\n###### Deeper\n## C#\n   ### Indented"), [
      { type: "heading", level: 2, children: [text("Top")] },
      { type: "heading", level: 4, children: [text("Deep")] },
      { type: "heading", level: 4, children: [text("Deeper")] },
      { type: "heading", level: 2, children: [text("C#")] },
      { type: "heading", level: 3, children: [text("Indented")] },
    ]);
  });

  it("treats lines that only look like headings or lists as text", () => {
    assert.deepEqual(parseMarkdown("#hashtag\n-dash\n####### seven\n## ##\n- \n+27 82 123 4567\n    ## code-indented"), [
      paragraph(
        text("#hashtag"),
        lineBreak,
        text("-dash"),
        lineBreak,
        text("####### seven"),
        lineBreak,
        text("## ##"),
        lineBreak,
        text("-"),
        lineBreak,
        text("+27 82 123 4567"),
        lineBreak,
        text("## code-indented"),
      ),
    ]);
  });

  it("numbers a list from its first number, and only lets 1. break into a paragraph", () => {
    assert.deepEqual(parseMarkdown("3. Third\n4. Fourth"), [{ type: "list", ordered: true, start: 3, items: [[text("Third")], [text("Fourth")]] }]);
    assert.deepEqual(parseMarkdown("We opened in\n2026. It went well.\n1. First"), [
      paragraph(text("We opened in"), lineBreak, text("2026. It went well.")),
      { type: "list", ordered: true, start: 1, items: [[text("First")]] },
    ]);
  });

  it("carries an indented line on the list item above it, and ends a list at an unindented one", () => {
    assert.deepEqual(parseMarkdown("- Booking requests: **your name,\n  your number**\n\tand your message\nAfter the list\n\n- again"), [
      {
        type: "list",
        ordered: false,
        items: [[text("Booking requests: "), strong(text("your name,"), lineBreak, text("your number")), lineBreak, text("and your message")]],
      },
      paragraph(text("After the list")),
      { type: "list", ordered: false, items: [[text("again")]] },
    ]);
  });

  it("starts a new list when bullets and numbers swap, and flattens nested items", () => {
    assert.deepEqual(parseMarkdown("- a\n    - nested\n1. b"), [
      { type: "list", ordered: false, items: [[text("a")], [text("nested")]] },
      { type: "list", ordered: true, start: 1, items: [[text("b")]] },
    ]);
  });

  it("copes with Windows and old Mac line endings, and with nothing at all", () => {
    assert.deepEqual(parseMarkdown("One\r\nTwo\rThree\r\n\r\nFour"), [paragraph(text("One"), lineBreak, text("Two"), lineBreak, text("Three")), paragraph(text("Four"))]);
    assert.deepEqual(parseMarkdown(""), []);
    assert.deepEqual(parseMarkdown(" \n\t\n"), []);
  });
});

describe("parseMarkdown: bold and italic", () => {
  it("reads both markers for each", () => {
    assert.deepEqual(inline("A **bold**, __also bold__, *italic* and _also italic_ end"), [
      text("A "),
      strong(text("bold")),
      text(", "),
      strong(text("also bold")),
      text(", "),
      emphasis(text("italic")),
      text(" and "),
      emphasis(text("also italic")),
      text(" end"),
    ]);
  });

  it("nests them either way round, and reads bold italic", () => {
    assert.deepEqual(inline("**Your *own* privacy.**"), [strong(text("Your "), emphasis(text("own")), text(" privacy."))]);
    assert.deepEqual(inline("*a **b** c*"), [emphasis(text("a "), strong(text("b")), text(" c"))]);
    assert.deepEqual(inline("***both***"), [emphasis(strong(text("both")))]);
    assert.deepEqual(inline("**bold**text and *a**b*"), [strong(text("bold")), text("text and "), emphasis(text("a**b"))]);
  });

  it("pairs what's left of longer runs as CommonMark does, and keeps markers it can't pair as text", () => {
    assert.deepEqual(inline("**a* and *b**"), [emphasis(emphasis(text("a")), text(" and "), emphasis(text("b")))]);
    assert.deepEqual(inline("**a* b"), [text("*"), emphasis(text("a")), text(" b")]);
    assert.deepEqual(inline("a *b**"), [text("a "), emphasis(text("b")), text("*")]);
    assert.deepEqual(inline("5 * 3, ** spaced **, **open, ****"), [text("5 * 3, ** spaced **, **open, ****")]);
  });

  it("leaves underscores inside words alone", () => {
    assert.deepEqual(inline("email romaic_guest_house@gmail.com about snake_case_names"), [text("email romaic_guest_house@gmail.com about snake_case_names")]);
  });

  it("carries formatting over a line break", () => {
    assert.deepEqual(inline("**bold\nstill bold**"), [strong(text("bold"), lineBreak, text("still bold"))]);
  });

  it("shows escaped characters as they are", () => {
    assert.deepEqual(inline("\\*not italic\\*, \\[not a link\\](/x), \\{email\\} and a \\ backslash"), [
      text("*not italic*, [not a link](/x), {email} and a \\ backslash"),
    ]);
    assert.deepEqual(inline("\\**a**"), [text("*"), emphasis(text("a")), text("*")]);
  });
});

describe("parseMarkdown: links", () => {
  it("links to https, email, phone and this site's pages", () => {
    assert.deepEqual(inline("[Regulator](https://inforegulator.org.za) [Email](mailto:a@b.co) [Call](tel:+27821234567) [Book](/book?type=duo)"), [
      link("https://inforegulator.org.za", text("Regulator")),
      text(" "),
      link("mailto:a@b.co", text("Email")),
      text(" "),
      link("tel:+27821234567", text("Call")),
      text(" "),
      link("/book?type=duo", text("Book")),
    ]);
  });

  it("formats link text, and formats around links", () => {
    assert.deepEqual(inline("*See [the **Privacy** notice](/privacy)*"), [emphasis(text("See "), link("/privacy", text("the "), strong(text("Privacy")), text(" notice")))]);
  });

  it("allows balanced parentheses and spaces around the address", () => {
    assert.deepEqual(inline("[POPIA](https://en.wikipedia.org/wiki/POPI_(Act)) and [home]( / )"), [
      link("https://en.wikipedia.org/wiki/POPI_(Act)", text("POPIA")),
      text(" and "),
      link("/", text("home")),
    ]);
  });

  it("leaves things that aren't quite links as text", () => {
    assert.deepEqual(inline("[](/x) [ ](/x) [no address]() [spaced](/a b) [label] (/x) [a [b] c](/x)"), [
      text("[](/x) [ ](/x) [no address]() [spaced](/a b) [label] (/x) [a [b] c](/x)"),
    ]);
  });

  it("shows a link it won't allow as its words, and says which link to fix", () => {
    assert.deepEqual(inline("Click [here](javascript:alert(1)) now"), [text("Click here now")]);
    assert.deepEqual(markdownProblems("Click [here](javascript:alert(1)) now"), [
      'Fix the link "here": links must start with https://, mailto: or tel:, or be a page on this site such as /book.',
    ]);
    assert.equal(markdownProblems("[a](data:text/html,x) [b](//evil.example) [c](http://plain.example) [d](#rights) [e](book)").length, 5);
    assert.deepEqual(markdownProblems("[a](http://x.example) [a](http://y.example)").length, 1);
  });

  it("finds no problems in links it allows, placeholders included", () => {
    assert.deepEqual(markdownProblems("## Fine\n\n[{email}](mailto:{email}) [Home](/) [Call](tel:{phone})"), []);
  });

  it("names a long link's text briefly in the problem", () => {
    const [problem] = markdownProblems(`[${"very ".repeat(20)}long](ftp://x)`);
    assert.match(problem ?? "", /^Fix the link "very very very very very very very very… ?"/u);
  });
});

describe("parseMarkdown: placeholders", () => {
  const values = { email: "romaic_*guest*@example.com", businessName: "Romaic Guesthouse" };

  it("fills them in as plain text, so values are never read as formatting", () => {
    assert.deepEqual(inline("**{businessName}**: [{email}](mailto:{email})", values), [
      strong(text("Romaic Guesthouse")),
      text(": "),
      link("mailto:romaic_*guest*@example.com", text("romaic_*guest*@example.com")),
    ]);
  });

  it("leaves unknown, escaped and inherited names as they are", () => {
    assert.deepEqual(inline("{unknown} \\{email} {toString} {email}", values), [text("{unknown} {email} {toString} romaic_*guest*@example.com")]);
    assert.deepEqual(inline("Email {email}"), [text("Email {email}")]);
  });

  it("drops a link whose filled-in address isn't allowed", () => {
    assert.deepEqual(inline("[x](/{path})", { path: "/evil.example" }), [text("x")]);
  });
});

describe("parseMarkdown: speed", () => {
  it("stays quick on long, awkward text, since the editor checks as you type", () => {
    const awkward = [
      `# ${" ".repeat(50_000)}x`,
      " ".repeat(50_000) + "x",
      "a **b ".repeat(5_000),
      "*a".repeat(10_000),
      "_a *b ".repeat(5_000),
      "[".repeat(20_000),
      "[a](".repeat(5_000),
      `[a](${"(".repeat(20_000)}`,
      "***a".repeat(5_000) + "b***".repeat(5_000),
    ].join("\n\n");
    const started = performance.now();
    markdownProblems(awkward);
    parseMarkdown(awkward);
    assert.ok(performance.now() - started < 1_000, `took ${Math.round(performance.now() - started)} ms`);
  });
});

describe("isAllowedHref", () => {
  it("allows https, email, phone and this site's pages only", () => {
    for (const href of ["https://inforegulator.org.za", "HTTPS://EXAMPLE.COM/a?b#c", "mailto:a@b.co", "tel:+27821234567", "/privacy", "/", "/privacy#rights"]) {
      assert.equal(isAllowedHref(href), true, href);
    }
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "http://example.com",
      "//example.com",
      "/\\example.com",
      "data:text/html,x",
      "https://",
      "https://user:secret@example.com",
      "ftp://x",
      "#rights",
      "privacy",
      "mailto:",
      "/a b",
      "/a\u0000b",
      "",
    ]) {
      assert.equal(isAllowedHref(href), false, href);
    }
  });
});
