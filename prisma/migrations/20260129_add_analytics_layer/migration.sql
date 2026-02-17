-- CreateTable
CREATE TABLE "analytics_health_intakes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "intake_id" UUID NOT NULL,
    "age_bucket" TEXT,
    "gender" TEXT,
    "region" TEXT,
    "primary_goals" TEXT[],
    "symptom_categories" TEXT[],
    "has_chronic_conditions" BOOLEAN,
    "taking_medications" BOOLEAN,
    "exercise_level" TEXT,
    "stress_level" TEXT,
    "sleep_quality" TEXT,
    "diet_type" TEXT,
    "risk_tolerance" TEXT,
    "budget_sensitivity" TEXT,
    "prefer_subscription" BOOLEAN,
    "intake_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_health_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_blood_tests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "blood_test_id" UUID NOT NULL,
    "panel_type" TEXT NOT NULL,
    "lab_partner_code" TEXT,
    "region" TEXT,
    "biomarker_flags" JSONB NOT NULL,
    "abnormal_count" INTEGER NOT NULL,
    "total_biomarkers" INTEGER NOT NULL,
    "age_bucket" TEXT,
    "gender" TEXT,
    "results_received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_blood_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_treatment_outcomes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "handoff_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "treatment_category" TEXT NOT NULL,
    "handoff_status" TEXT NOT NULL,
    "converted_to_treatment" BOOLEAN NOT NULL,
    "subscription_active" BOOLEAN,
    "days_to_conversion" INTEGER,
    "subscription_months" INTEGER,
    "revenue_generated" DECIMAL(10,2),
    "commission_generated" DECIMAL(10,2),
    "age_bucket" TEXT,
    "gender" TEXT,
    "region" TEXT,
    "handoff_initiated_at" TIMESTAMP(3) NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_treatment_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_analytics_snapshots" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "total_handoffs" INTEGER NOT NULL,
    "converted_handoffs" INTEGER NOT NULL,
    "conversion_rate" DECIMAL(5,4) NOT NULL,
    "active_subscriptions" INTEGER NOT NULL,
    "churned_subscriptions" INTEGER NOT NULL,
    "retention_rate" DECIMAL(5,4),
    "total_revenue" DECIMAL(12,2) NOT NULL,
    "total_commission" DECIMAL(12,2) NOT NULL,
    "avg_revenue_per_handoff" DECIMAL(10,2),
    "conversion_rank" INTEGER,
    "retention_rank" INTEGER,
    "revenue_rank" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_health_intakes_intake_id_key" ON "analytics_health_intakes"("intake_id");

-- CreateIndex
CREATE INDEX "analytics_health_intakes_age_bucket_idx" ON "analytics_health_intakes"("age_bucket");

-- CreateIndex
CREATE INDEX "analytics_health_intakes_gender_idx" ON "analytics_health_intakes"("gender");

-- CreateIndex
CREATE INDEX "analytics_health_intakes_region_idx" ON "analytics_health_intakes"("region");

-- CreateIndex
CREATE INDEX "analytics_health_intakes_primary_goals_idx" ON "analytics_health_intakes"("primary_goals");

-- CreateIndex
CREATE INDEX "analytics_health_intakes_created_at_idx" ON "analytics_health_intakes"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_blood_tests_blood_test_id_key" ON "analytics_blood_tests"("blood_test_id");

-- CreateIndex
CREATE INDEX "analytics_blood_tests_panel_type_idx" ON "analytics_blood_tests"("panel_type");

-- CreateIndex
CREATE INDEX "analytics_blood_tests_lab_partner_code_idx" ON "analytics_blood_tests"("lab_partner_code");

-- CreateIndex
CREATE INDEX "analytics_blood_tests_age_bucket_idx" ON "analytics_blood_tests"("age_bucket");

-- CreateIndex
CREATE INDEX "analytics_blood_tests_gender_idx" ON "analytics_blood_tests"("gender");

-- CreateIndex
CREATE INDEX "analytics_blood_tests_created_at_idx" ON "analytics_blood_tests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_treatment_outcomes_handoff_id_key" ON "analytics_treatment_outcomes"("handoff_id");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_provider_id_idx" ON "analytics_treatment_outcomes"("provider_id");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_treatment_id_idx" ON "analytics_treatment_outcomes"("treatment_id");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_treatment_category_idx" ON "analytics_treatment_outcomes"("treatment_category");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_handoff_status_idx" ON "analytics_treatment_outcomes"("handoff_status");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_converted_to_treatment_idx" ON "analytics_treatment_outcomes"("converted_to_treatment");

-- CreateIndex
CREATE INDEX "analytics_treatment_outcomes_created_at_idx" ON "analytics_treatment_outcomes"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_analytics_snapshots_provider_id_snapshot_date_key" ON "provider_analytics_snapshots"("provider_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "provider_analytics_snapshots_provider_id_idx" ON "provider_analytics_snapshots"("provider_id");

-- CreateIndex
CREATE INDEX "provider_analytics_snapshots_snapshot_date_idx" ON "provider_analytics_snapshots"("snapshot_date");
