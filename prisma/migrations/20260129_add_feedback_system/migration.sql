-- ============================================
-- Feedback & Rating System Migration
-- ============================================

-- CreateEnum for ProviderRatingCategory
CREATE TYPE "ProviderRatingCategory" AS ENUM ('OVERALL', 'COMMUNICATION', 'PROFESSIONALISM', 'RESULTS', 'VALUE_FOR_MONEY');

-- CreateEnum for TreatmentFeedbackOutcome
CREATE TYPE "TreatmentFeedbackOutcome" AS ENUM ('EXCELLENT', 'GOOD', 'NEUTRAL', 'DISAPPOINTING', 'POOR');

-- CreateTable: Provider Ratings
CREATE TABLE "provider_ratings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "handoff_id" UUID,
    "category" "ProviderRatingCategory" NOT NULL DEFAULT 'OVERALL',
    "rating" INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    "review_title" TEXT,
    "review_text" TEXT,
    "would_recommend" BOOLEAN,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "reported_count" INTEGER NOT NULL DEFAULT 0,
    "moderation_status" TEXT NOT NULL DEFAULT 'APPROVED',
    "moderated_at" TIMESTAMP(3),
    "moderated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Treatment Feedback
CREATE TABLE "treatment_feedback" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "handoff_id" UUID,
    "outcome" "TreatmentFeedbackOutcome" NOT NULL,
    "effectiveness_rating" INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
    "side_effects_rating" INTEGER CHECK (side_effects_rating >= 1 AND side_effects_rating <= 5),
    "ease_of_use_rating" INTEGER CHECK (ease_of_use_rating >= 1 AND ease_of_use_rating <= 5),
    "feedback_text" TEXT,
    "symptoms_improved" TEXT[],
    "symptoms_unchanged" TEXT[],
    "symptoms_worsened" TEXT[],
    "side_effects_experienced" TEXT[],
    "duration_weeks" INTEGER,
    "would_continue" BOOLEAN,
    "would_recommend" BOOLEAN,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "moderation_status" TEXT NOT NULL DEFAULT 'PENDING',
    "moderated_at" TIMESTAMP(3),
    "moderated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Provider Rating Summary (Materialized View equivalent)
CREATE TABLE "provider_rating_summaries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider_id" UUID NOT NULL UNIQUE,
    "overall_rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "communication_rating" DECIMAL(3,2),
    "professionalism_rating" DECIMAL(3,2),
    "results_rating" DECIMAL(3,2),
    "value_rating" DECIMAL(3,2),
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "five_star_count" INTEGER NOT NULL DEFAULT 0,
    "four_star_count" INTEGER NOT NULL DEFAULT 0,
    "three_star_count" INTEGER NOT NULL DEFAULT 0,
    "two_star_count" INTEGER NOT NULL DEFAULT 0,
    "one_star_count" INTEGER NOT NULL DEFAULT 0,
    "recommendation_rate" DECIMAL(5,4),
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_rating_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Treatment Feedback Summary (Materialized View equivalent)
CREATE TABLE "treatment_feedback_summaries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "treatment_id" UUID NOT NULL UNIQUE,
    "provider_id" UUID NOT NULL,
    "avg_effectiveness" DECIMAL(3,2),
    "avg_side_effects" DECIMAL(3,2),
    "avg_ease_of_use" DECIMAL(3,2),
    "total_feedback" INTEGER NOT NULL DEFAULT 0,
    "excellent_count" INTEGER NOT NULL DEFAULT 0,
    "good_count" INTEGER NOT NULL DEFAULT 0,
    "neutral_count" INTEGER NOT NULL DEFAULT 0,
    "disappointing_count" INTEGER NOT NULL DEFAULT 0,
    "poor_count" INTEGER NOT NULL DEFAULT 0,
    "continuation_rate" DECIMAL(5,4),
    "recommendation_rate" DECIMAL(5,4),
    "common_improvements" TEXT[],
    "common_side_effects" TEXT[],
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_feedback_summaries_pkey" PRIMARY KEY ("id")
);

-- Create Indexes
CREATE INDEX "idx_provider_ratings_user_id" ON "provider_ratings"("user_id");
CREATE INDEX "idx_provider_ratings_provider_id" ON "provider_ratings"("provider_id");
CREATE INDEX "idx_provider_ratings_handoff_id" ON "provider_ratings"("handoff_id");
CREATE INDEX "idx_provider_ratings_category" ON "provider_ratings"("category");
CREATE INDEX "idx_provider_ratings_rating" ON "provider_ratings"("rating");
CREATE INDEX "idx_provider_ratings_created_at" ON "provider_ratings"("created_at");
CREATE INDEX "idx_provider_ratings_moderation" ON "provider_ratings"("moderation_status", "is_public");

CREATE INDEX "idx_treatment_feedback_user_id" ON "treatment_feedback"("user_id");
CREATE INDEX "idx_treatment_feedback_treatment_id" ON "treatment_feedback"("treatment_id");
CREATE INDEX "idx_treatment_feedback_provider_id" ON "treatment_feedback"("provider_id");
CREATE INDEX "idx_treatment_feedback_handoff_id" ON "treatment_feedback"("handoff_id");
CREATE INDEX "idx_treatment_feedback_outcome" ON "treatment_feedback"("outcome");
CREATE INDEX "idx_treatment_feedback_created_at" ON "treatment_feedback"("created_at");
CREATE INDEX "idx_treatment_feedback_moderation" ON "treatment_feedback"("moderation_status", "is_public");

CREATE INDEX "idx_provider_rating_summaries_provider" ON "provider_rating_summaries"("provider_id");
CREATE INDEX "idx_treatment_feedback_summaries_treatment" ON "treatment_feedback_summaries"("treatment_id");

-- Add Foreign Keys
ALTER TABLE "provider_ratings" ADD CONSTRAINT "fk_provider_ratings_user" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "provider_ratings" ADD CONSTRAINT "fk_provider_ratings_provider" 
    FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE;

ALTER TABLE "provider_ratings" ADD CONSTRAINT "fk_provider_ratings_handoff" 
    FOREIGN KEY ("handoff_id") REFERENCES "provider_handoffs"("id") ON DELETE SET NULL;

ALTER TABLE "treatment_feedback" ADD CONSTRAINT "fk_treatment_feedback_user" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "treatment_feedback" ADD CONSTRAINT "fk_treatment_feedback_treatment" 
    FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE;

ALTER TABLE "treatment_feedback" ADD CONSTRAINT "fk_treatment_feedback_provider" 
    FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE;

ALTER TABLE "treatment_feedback" ADD CONSTRAINT "fk_treatment_feedback_handoff" 
    FOREIGN KEY ("handoff_id") REFERENCES "provider_handoffs"("id") ON DELETE SET NULL;

ALTER TABLE "provider_rating_summaries" ADD CONSTRAINT "fk_rating_summary_provider" 
    FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE;

ALTER TABLE "treatment_feedback_summaries" ADD CONSTRAINT "fk_feedback_summary_treatment" 
    FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE;

ALTER TABLE "treatment_feedback_summaries" ADD CONSTRAINT "fk_feedback_summary_provider" 
    FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE;

-- Add Unique Constraints to prevent duplicate ratings
CREATE UNIQUE INDEX "idx_unique_user_provider_rating" 
    ON "provider_ratings"("user_id", "provider_id", "category") 
    WHERE "handoff_id" IS NULL;

CREATE UNIQUE INDEX "idx_unique_handoff_rating" 
    ON "provider_ratings"("handoff_id", "category") 
    WHERE "handoff_id" IS NOT NULL;

CREATE UNIQUE INDEX "idx_unique_user_treatment_feedback" 
    ON "treatment_feedback"("user_id", "treatment_id") 
    WHERE "handoff_id" IS NULL;

CREATE UNIQUE INDEX "idx_unique_handoff_feedback" 
    ON "treatment_feedback"("handoff_id") 
    WHERE "handoff_id" IS NOT NULL;
