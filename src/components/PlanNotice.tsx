import { planLimitText, type PlanLimitName } from '../../core';
import { href, useStore } from '../store';

/**
 * A calm one-line note where a free-plan limit applies. Renders nothing on instances
 * without limits, so self-hosters never see it. `force` shows it after the backend
 * answered a plan_limit 403, even when the profile could not be loaded.
 */
export function PlanNotice({ limit, force = false }: { limit: PlanLimitName; force?: boolean }) {
  const { profile } = useStore();
  if (!profile?.limitsEnabled && !force) return null;
  return (
    <div className="plan-note small" role="note">
      <span>{planLimitText(limit, profile?.limits.maxAccounts)}</span>
      {profile?.limitsEnabled ? <a className="link" href={href('settings', { tab: 'plan' })}>About the plan</a> : null}
    </div>
  );
}
