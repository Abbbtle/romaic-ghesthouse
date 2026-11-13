/**
 * Every legal duty or timeframe the privacy pages state, with where it was
 * read and when (brief rule: never invent facts, legal ones included). Each
 * was read on the official source on the day given, and the wording is kept
 * close to the source. Nothing else on the pages states a duty or a number
 * of days: where the Act gives none, the owner sets the date and the page
 * says to check with the Information Officer.
 *
 * - The Act: Protection of Personal Information Act 4 of 2013, as published
 *   in Government Gazette No. 37067 of 26 November 2013, from gov.za's page
 *   for the Act (its PDF:
 *   https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf).
 *   Read 13 Nov 2026: sections 14(1) and (4), 22, 23(1), 24(2) and 55(2).
 * - The Information Regulator's POPIA page (https://inforegulator.org.za/popia/).
 *   Read 13 Nov 2026: section 22 notifications go through its eServices
 *   portal from 1 April 2025; Information Officers are registered there.
 *
 * Not legal advice: the pages say so, and point the owner to their
 * Information Officer (and a legal adviser) for anything they decide.
 */

export type LegalSource = { title: string; url: string; checkedOn: string };

export const popiaAct: LegalSource = {
  title: "Protection of Personal Information Act 4 of 2013 (Government Gazette No. 37067, 26 November 2013)",
  url: "https://www.gov.za/documents/protection-personal-information-act",
  checkedOn: "2026-11-13",
};

export const regulatorPopiaPage: LegalSource = {
  title: "Information Regulator: POPIA",
  url: "https://inforegulator.org.za/popia/",
  checkedOn: "2026-11-13",
};

/** The Regulator's eServices portal, where section 22 notifications and Information Officer registrations are made (per its POPIA page). */
export const regulatorPortalUrl = "https://eservices.inforegulator.org.za/";

export type LegalPoint = { section: string; text: string; source: LegalSource };

/** What the Act says about answering requests: no fixed number of days for either kind. */
export const requestTimeframes: readonly LegalPoint[] = [
  {
    section: "Section 23(1)",
    text: "A person who has given adequate proof of identity may ask whether you hold personal information about them, and for the record or a description of it, which you give within a reasonable time.",
    source: popiaAct,
  },
  {
    section: "Section 24(2)",
    text: "On a request to correct or delete personal information, you act as soon as reasonably practicable.",
    source: popiaAct,
  },
];

/** What the Act says about keeping records. */
export const retentionPoints: readonly LegalPoint[] = [
  {
    section: "Section 14(1)",
    text: "Records of personal information must not be kept longer than necessary for the purpose they were collected for, unless, among other reasons, a law requires or allows keeping them.",
    source: popiaAct,
  },
  {
    section: "Section 14(4)",
    text: "Once a record may no longer be kept, it is destroyed, deleted or de-identified as soon as reasonably practicable.",
    source: popiaAct,
  },
];

/** Section 22 and the Regulator's page, in the order the procedure follows. */
export const breachDuties = {
  whoToTell: {
    section: "Section 22(1)",
    text: "Where there are reasonable grounds to believe that someone's personal information has been accessed or acquired by an unauthorised person, the responsible party must notify the Information Regulator and the person concerned, unless their identity can't be established.",
    source: popiaAct,
  },
  when: {
    section: "Section 22(2)",
    text: "As soon as reasonably possible after the compromise is discovered, taking into account the legitimate needs of law enforcement and any measures reasonably needed to find out how far it goes and to restore the integrity of the information system.",
    source: popiaAct,
  },
  delay: {
    section: "Section 22(3)",
    text: "Telling the people affected may be delayed only if a public body responsible for preventing, detecting or investigating offences, or the Regulator, decides that telling them will impede a criminal investigation.",
    source: popiaAct,
  },
  how: {
    section: "Section 22(4)",
    text: "The people affected are told in writing, in at least one of these ways: by post to their last known address, by email to their last known email address, in a prominent place on the website, in the news media, or as the Regulator directs.",
    source: popiaAct,
  },
  what: {
    section: "Section 22(5)",
    text: "Tell them enough to protect themselves: the possible consequences, what you've done or will do about it, what they can do to limit the harm, and who accessed their information, if you know.",
    source: popiaAct,
  },
  portal: {
    section: "The Regulator's POPIA page",
    text: "From 1 April 2025, notifications under section 22 should be reported on the Information Regulator's eServices portal.",
    source: regulatorPopiaPage,
  },
} as const satisfies Record<string, LegalPoint>;

/** Section 55(2) and the Regulator's page, for the Information Officer panel. */
export const officerRegistration: readonly LegalPoint[] = [
  {
    section: "Section 55(2)",
    text: "An Information Officer takes up their duties only after the business has registered them with the Regulator.",
    source: popiaAct,
  },
  {
    section: "The Regulator's POPIA page",
    text: "Information Officers and their deputies are registered on the Regulator's eServices portal.",
    source: regulatorPopiaPage,
  },
];
