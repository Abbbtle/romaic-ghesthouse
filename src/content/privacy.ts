import type { PrivacySection } from "@/lib/content/schema";

/**
 * The Privacy Notice page, as a DRAFT for the owner (and ideally a legal
 * reviewer) to complete before launch. It states what the site's forms will
 * collect and why, and leaves every fact we don't have as a marked blank:
 * where the data is stored, who processes it, how long it's kept and who the
 * Information Officer is (docs/planning/open-questions.md #27, #30). It is
 * not legal advice. {businessName}, {location}, {email} and {phone} fill in
 * the business and contact details.
 */
export const privacyDefaults: PrivacySection = {
  heading: "Privacy notice",
  version: "0.1",
  updatedOn: "2026-11-12",
  body: `**Draft for the owner to review before the website goes live.** Weberu prepared this notice from what we know so far. Every part marked "To be completed" needs the owner's answer, and the whole notice should be checked before it's published.

## Who we are

{businessName}, {location}. To ask about your personal information, email {email} or call {phone}.

## What we collect

When you ask about a stay or send a booking request, we collect your name, phone number and email address, the dates you'd like to stay, how many guests are coming, and anything you tell us in your message.

## Why we collect it

We use your details to answer your enquiry, to manage your booking and to contact you about your stay.

To be completed by the owner: whether you ever use guests' details for anything else, such as marketing, and how guests agree to that.

## Who we share it with

To be completed by the owner: the companies that process guests' details for you, such as the website's hosting provider, its email service and any payment provider.

## Where your information is stored

To be completed by the owner: the country where the website's data is stored, and why that is allowed.

## How long we keep it

To be completed by the owner: how long you keep enquiries, booking records and guest details, and why.

## How we protect it

On this website, only the people who need your details to look after your stay can see them, and each of them signs in with their own account.

To be completed by the owner: how you look after guests' details outside the website, such as paper records at reception.

## Your rights

You may ask to see the personal information we hold about you, to have it corrected or deleted, and to object to how we use it. To do so, email {email}. You may also complain to the Information Regulator.

## Information Officer

To be completed by the owner: the name of the Information Officer and how to contact them.

## Changes to this notice

When we change this notice, we update the date and version at the top of this page.`,
};
