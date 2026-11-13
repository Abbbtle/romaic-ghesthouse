"use client";

import { sitePageNames, sitePagePaths, sitePages, type SitePage } from "@/lib/content/pages";
import type { SeoSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, type EditorPartLink } from "../editor-part";

const seoPart = (page: SitePage): EditorPartLink => ({ id: `page-${page}`, title: sitePageNames[page] });

export const seoParts = { links: sitePages.map(seoPart) };

/** Each page's title and description as search engines show them. */
export function SeoEditor({ data }: { data: SeoSection }) {
  return (
    <>
      {sitePages.map((page) => {
        const seo = data.pages[page];
        return (
          <EditorPart key={page} {...seoPart(page)} description={`The page at ${sitePagePaths[page]}.`}>
            <ContentText
              name={`pages.${page}.title`}
              label="Title"
              limit="seoTitle"
              defaultValue={seo.title}
              hint="Shown as the link in search results and on the browser tab. Write it out in full: nothing is added to it."
            />
            <ContentText
              name={`pages.${page}.description`}
              label="Description"
              limit="seoDescription"
              multiline
              rows={3}
              defaultValue={seo.description}
              hint="The line or two under the link in search results."
            />
          </EditorPart>
        );
      })}
    </>
  );
}
