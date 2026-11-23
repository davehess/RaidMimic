// raidmimic.com/refunds: how Pro billing, cancelling and refunds work (the guild lead's pre-launch checklist, 2026-11-01).
// Served at raidmimic.com/refunds (the middleware rewrites /refunds here) and at wolfpack.quest/raidmimic/refunds. A NEW page:
// it ships with the [beta] tag.
//
// ⚠ PAYMENTS ARE NOT LIVE. There is no billing code anywhere in the repository. The page says so at the top, in words, and
// every line below is written as what WILL be true when billing opens. Remove the banner only when billing really is live.
// The price is web/lib/raidmimicStory.ts (GUILD_PRICE_SENTENCE, TIERS). No free month (removed 2026-11-17, DECISIONS §612).
// No refunds (the guild lead, 2026-11-22, DECISIONS §651: "I don't want to offer refunds it's a subscription service";
// "no full refunds" was tried and dropped for plain "no refunds", pick A; the line about a refund the law gives is removed):
// cancelling stops the next charge and Pro runs to the end of the paid month. The page keeps its /refunds address because
// the footer, the sitemap and the terms link it.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { isRaidmimicHost, raidmimicSeo } from '@/lib/raidmimicHost';
import { CONTACT_EMAIL, CONTACT_HREF, LEGAL_META, legalPaths } from '@/lib/legal';
import { GUILD_PRICE_SENTENCE } from '@/lib/raidmimicStory';
import { B, Bullets, LEGAL_LINK, LegalShell, Section } from '../_legal/LegalParts';

export function generateMetadata(): Metadata {
  const { title, description } = LEGAL_META.refunds;
  return {
    title: { absolute: title },
    description,
    ...raidmimicSeo(headers().get('host'), '/refunds'),
    openGraph: { title, description, siteName: 'Raid Mimic', type: 'website' },
    twitter: { card: 'summary' },
  };
}

export default function RaidmimicRefundsPage() {
  const onHost = isRaidmimicHost(headers().get('host'));
  const p = legalPaths(onHost);
  return (
    <LegalShell onHost={onHost} title="Billing and refunds"
      lead="How Pro is billed and how to stop it. Pro is a subscription, and there are no refunds.">
      <div role="note" aria-label="Payments are not live yet" data-payments-note
        className="mt-6 rounded-md border border-gold/70 bg-panel p-4 text-sm leading-6 text-white">
        <B>Payments are not live yet.</B> Nothing is charged today. This page is what will be true on the day billing opens.
      </div>

      <Section title="How billing works">
        <Bullets>
          <li><B>Pro · Guild</B> is {GUILD_PRICE_SENTENCE}. <B>Monthly only</B>: there is no yearly plan.</li>
          <li>It renews every month until you cancel.</li>
        </Bullets>
      </Section>

      <Section title="Cancelling">
        <Bullets>
          <li><B>Cancel any time, in one click.</B> No call, no form, no email needed.</li>
          <li>You <B>keep Pro until the end of the month you have paid for</B>, then you are back on the free tier.</li>
          <li>Cancelling stops the next charge. The month you are in is not refunded.</li>
        </Bullets>
      </Section>

      <Section title="Refunds">
        <p>
          <B>There are no refunds.</B> Pro is a monthly subscription: cancel before the next renewal and you are not charged
          again.
        </p>
      </Section>

      <Section title="Billing questions">
        <p>
          Charged twice, or charged after you cancelled? Email <a href={CONTACT_HREF} className={LEGAL_LINK}>{CONTACT_EMAIL}</a>{' '}
          with your guild’s name and the date of the charge, and we will put it right.
        </p>
        <p>
          More in the <a href={p.terms} className={LEGAL_LINK}>Terms</a> and the <a href={p.privacy} className={LEGAL_LINK}>Privacy policy</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
