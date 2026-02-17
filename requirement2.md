## HealthPilot

# Product Feature & Flow Overview

This document summarises key user & system flows and the feature scope, aligned with
the approved FigJam board. It is intended for engineering reference and parallel
development.

## 1. Product Overview

```
a. HealthPilot is a web-based health guidance platform that helps users:
i. Describe their health situation through a guided intake
ii. Receive non-diagnostic, explainable recommendations
iii. Optionally connect to providers or pursue deeper analysis (e.g.
blood tests)
b. The system is powered by:
i. Configurable providers
ii. Treatment definitions
iii. Rule-based eligibility & matching logic
```
## 2. Entry Points & User Types

### a. User Types

```
i. Anonymous user (default)
ii. Logged-in user (optional account)
iii. High-intent user (explicitly wants full blood test analysis)
```
### b. Entry Paths

```
i. Guided Check (Default Path) → majority of users
ii. Full Blood Test / Health Analysis (High-Intent Path) → explicit intent,
deeper commitment
```
## 3. User-Side Core Flows

### a. P

```
i. Flow 1 — Anonymous User → Health Result
```
_1. Purpose: Enable users to get value without login._
**2. Screens involved:**
    a. Landing / Entry Screen
    b. Guided Intake Screen
    c. Health Summary Screen
    d. Pathway / Recommendation Screen
**ii. Flow 2 — Anonymous → Provider Handoff**
_1. Purpose: Allow users to continue to provider-level actions._
**2. Screens involved:**
a. Pathway / Recommendation Screen


```
b. Provider detail / external link (if applicable)
```
### b. P

```
i. Flow 3 — Result → Optional Account Creation
```
_1. Purpose: Save results & enable continuity._
**2. Screens involved:**
    a. Save prompt
    b. Lightweight signup
    c. User Dashboard (post-signup)
**ii. Flow 4 — Returning User → New Intake (P1)**
_1. Purpose: Allow users to restart or continue._
**2. Screens involved:**
a. User Dashboard
b. Guided Intake (fresh or reused context)
c. Updated Health Summary
**iii. Flow 5 — “Why this?” Explanation (P1)**
_1. Purpose: Build trust & explainability._
**2. Screens / layers involved:**
a. Inline or modal explanation layer
b. Explanation content blocks (signals, reasoning,
limits)
**iv. Flow 6 — High-Intent User → Full Blood Test Pathway (P1,
Alternate Entry)**
_1. Purpose: Serve users who explicitly want a comprehensive
health analysis._
**2. Screens involved:**
a. High-Intent Entry Screen
b. Comprehensive Medical Intake
c. Biomarker / Blood Test Definition (user-facing)
d. Blood Test Completion (external step)
e. Blood Test Results & Interpretation
f. Optimisation-focused recommendations

## 4. User-Side Screen Inventory

### a. P0 — Core User Experience (Must Have)

```
i. Landing / Entry Screen
ii. Guided Intake Screen
iii. Health Summary Screen
iv. Pathway / Recommendation Screen
```
### b. P1 — Trust, Continuity & Depth

```
i. “Why this?” Explanation Layer
ii. Optional Account Creation
iii. User Dashboard (Logged-in)
```
### c. P1 — High-Intent Blood Test Screens

```
i. High-Intent Blood Test Entry
```

```
ii. Comprehensive Medical Intake
iii. Biomarker / Blood Test Definition
iv. Blood Test Results & Interpretation
```
## 5. Provider / Admin-Side Core Flows

```
a. These screens are required to enable any user-facing recommendations,
even though users never see them.
```
### b. Flow A — Provider Onboarding (P0)

```
i. Screens:
```
1. Provider Management Dashboard
2. Provider Profile Setup

### c. Flow B — Treatment Setup (P0)

```
i. Screens:
```
1. Treatment Management Dashboard
2. Treatment Definition Screen

### d. Flow C — Eligibility & Matching Rules (P0)

```
i. Screens:
```
1. Matching Rules Dashboard
2. Rule Builder Screen
**ii. Purpose:**
1. Define how user signals map to treatments & providers.

## 6. Provider / Admin Screen Inventory

```
a. Provider Management Dashboard
b. Provider Profile Setup
c. Treatment Management Dashboard
d. Treatment Definition Screen
e. Matching Rules Dashboard
f. Rule Builder Screen
```
## 7. How Developers Should Use This

```
a. Use Screen Inventory to understand what screens exist
b. Use Flows to understand how data moves
c. Use UX Prioritisation (P0/P1) to sequence work
d. Refer to FigJam for detailed structure per screen
```
## 8. Recommendation Logic (High-Level)

```
a. Rule-based matching (no diagnostic output)
b. Relative relevance (not numeric scoring exposed)
c. Graceful handling of:
i. Limited matches
ii. No clear match
d. Explainability supported via “Why this?” layer
```
## 9. Source of Truth

```
a. User Journey
b. All Key Flows
```

c. Screen Inventory & UX Prioritisation
d. Screen Structure Definition


