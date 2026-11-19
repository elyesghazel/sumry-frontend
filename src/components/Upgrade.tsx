import { PREMIUM_PRICE, showUpgrade } from '../../core';
import { href, useStore } from '../store';

const planHref = () => href('settings', { tab: 'plan' });

/**
 * The way to Premium in the sidebar. Renders nothing for premium users and on
 * instances without limits, so self-hosters never see it.
 */
export function UpgradeEntry() {
  const { profile } = useStore();
  if (!showUpgrade(profile)) return null;
  return (
    <a className="upgrade-entry" href={planHref()}>
      <span className="upgrade-title">Upgrade to Premium</span>
      <span className="tiny faint">{PREMIUM_PRICE}</span>
    </a>
  );
}

/** The same offer as a one-line banner, for narrow screens where the sidebar is hidden. */
export function UpgradeBanner() {
  const { profile } = useStore();
  if (!showUpgrade(profile)) return null;
  return (
    <a className="upgrade-banner show-sm-flex" href={planHref()}>
      <span className="grow">Upgrade to Premium <span className="faint">· {PREMIUM_PRICE}</span></span>
      <span className="upgrade-go" aria-hidden>→</span>
    </a>
  );
}
