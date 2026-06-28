export const REWARD_DISCLAIMER =
  "Rewards are offered at the restaurant owner's sole discretion. Management may modify, withhold, or cancel any reward at any time.";

export const REWARD_VALIDITY_HOURS = 48;

export function rewardExpiresAt(from = new Date()) {
  return new Date(from.getTime() + REWARD_VALIDITY_HOURS * 60 * 60 * 1000);
}

export function formatRewardExpiry(date: Date | string) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
