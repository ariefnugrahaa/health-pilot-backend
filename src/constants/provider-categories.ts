export const PROVIDER_CATEGORY_VALUES = [
  'LOW_ENERGY',
  'DIGESTIVE_DISCOMFORT',
  'POOR_SLEEP',
  'GUT',
  'WEIGHT_MANAGEMENT',
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORY_VALUES)[number];

export function isProviderCategory(value: unknown): value is ProviderCategory {
  return typeof value === 'string' && PROVIDER_CATEGORY_VALUES.includes(value as ProviderCategory);
}
