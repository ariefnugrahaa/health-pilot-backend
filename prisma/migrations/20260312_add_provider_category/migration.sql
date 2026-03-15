CREATE TYPE "ProviderCategory" AS ENUM (
  'LOW_ENERGY',
  'DIGESTIVE_DISCOMFORT',
  'POOR_SLEEP',
  'GUT',
  'WEIGHT_MANAGEMENT'
);

ALTER TABLE "providers"
ADD COLUMN "category" "ProviderCategory";

ALTER TABLE "provider_invites"
ADD COLUMN "category" "ProviderCategory";
