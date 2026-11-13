"use client";

import { Select } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import { listLimits } from "@/lib/content/limits";
import { sectionHelp, socialPlatformNames, type SiteSection, type SocialLink } from "@/lib/content/schema";
import { ContentText, OptionalFields } from "../content-fields";
import { socialPlatformOptions } from "../choices";
import { EditorPart, partsOf } from "../editor-part";
import { ListEditor } from "../list-editor";

export const siteParts = partsOf({
  business: "Your business",
  address: "Address",
  social: "Social links",
  credit: "Footer credit",
});

const { part } = siteParts;

const newSocialLink = (): SocialLink => ({ platform: "facebook", url: "" });

/** Business details: stored once and used wherever the site shows them. */
export function SiteEditor({ data }: { data: SiteSection }) {
  const { address } = data;
  return (
    <>
      <EditorPart {...part.business} description="Your name and a few words about the guesthouse, in the footer and in search results.">
        <ContentText name="businessName" label="Business name" limit="businessName" defaultValue={data.businessName} />
        <ContentText
          name="description"
          label="Short description"
          limit="siteDescription"
          multiline
          rows={3}
          defaultValue={data.description}
          hint="The footer shows it, and search engines use it when a page has no description of its own."
        />
      </EditorPart>

      <EditorPart {...part.address} description="Shown on the site and to search engines. The map link is worked out from it.">
        <Notice tone="info" live="off">
          {sectionHelp.site}
        </Notice>
        <div className="grid gap-5 sm:grid-cols-2">
          <ContentText name="address.street" label="Street address" limit="addressPart" defaultValue={address.street} autoComplete="address-line1" />
          <ContentText name="address.area" label="Suburb" limit="addressPart" defaultValue={address.area} />
          <ContentText name="address.city" label="Town or city" limit="addressPart" defaultValue={address.city} autoComplete="address-level2" />
          <ContentText name="address.province" label="Province" limit="addressPart" optional defaultValue={address.province} autoComplete="address-level1" />
          <ContentText name="address.postalCode" label="Postal code" limit="postalCode" optional defaultValue={address.postalCode} autoComplete="postal-code" />
        </div>
        <ContentText
          name="address.mapUrl"
          label="Google Maps link"
          limit="url"
          inputMode="url"
          optional
          defaultValue={address.mapUrl ?? ""}
          hint="Only if searching for the address finds the wrong place. Paste the link from Share in Google Maps."
        />
      </EditorPart>

      <EditorPart {...part.social} description="Icons in the footer that open your social media pages.">
        <ListEditor
          name="socialLinks"
          noun={{ one: "social link", many: "social links" }}
          items={data.socialLinks}
          limits={listLimits.socialLinks}
          blank={newSocialLink}
          variant="card"
          rowTitle={({ item, added, index }) => (added ? `Social link ${index + 1}` : socialPlatformNames[item.platform])}
        >
          {({ item, path }) => (
            <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Select name={`${path}.platform`} label="Platform" options={socialPlatformOptions} defaultValue={item.platform} />
              <ContentText name={`${path}.url`} label="Link" limit="url" inputMode="url" defaultValue={item.url} placeholder="https://" />
            </div>
          )}
        </ListEditor>
      </EditorPart>

      <EditorPart {...part.credit} description="A small line at the bottom of every page, crediting who made the site.">
        <OptionalFields name="footerCredit" label="Show a credit in the footer" defaultOn={data.footerCredit !== null}>
          <ContentText name="footerCredit.label" label="Credit" limit="footerCredit" defaultValue={data.footerCredit?.label ?? ""} />
          <ContentText
            name="footerCredit.url"
            label="Link"
            limit="url"
            inputMode="url"
            optional
            defaultValue={data.footerCredit?.url ?? ""}
            placeholder="https://"
          />
        </OptionalFields>
      </EditorPart>
    </>
  );
}
