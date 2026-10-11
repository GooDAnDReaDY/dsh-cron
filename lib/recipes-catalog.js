import { RECIPES as BASE_RECIPES } from './recipes.js';

/**
 * Enhanced Verified Recipes Catalog with guided parameters, dependencies, and test runs (#322).
 */

export const EXTENDED_RECIPES = [
  ...BASE_RECIPES,
  {
    id: 'recipe_gitea_issues_digest',
    category: 'maintenance',
    title: 'Gitea Issues Weekly Digest',
    description: 'Summarises open bugs and feature issues from local Gitea and reports triage status.',
    type: 'llm',
    schedule: '0 9 * * 1',
    scheduleText: 'Mondays at 09:00',
    prompt: 'Query open Gitea issues. Group by priority and scope, highlight stale issues, and produce an actionable weekly triage digest.',
    channels: ['telegram'],
    silentRule: 'Stay silent when there are no new or updated issues in the past 7 days.',
    dependencies: {
      integrations: ['gitea'],
      credentials: ['giteaTokenRef'],
    },
    parameters: [
      { name: 'repo', label: 'Repository (owner/name)', type: 'string', default: 'goodandready/dsh-cron' },
      { name: 'daysBack', label: 'Days back', type: 'number', default: 7 },
    ],
  },
  {
    id: 'recipe_security_dependency_audit',
    category: 'security',
    title: 'NPM Dependency Security Audit',
    description: 'Runs npm audit in repository directory and alerts on critical or high vulnerabilities.',
    type: 'script',
    schedule: '0 6 * * 1',
    scheduleText: 'Mondays at 06:00',
    prompt: 'npm audit --audit-level=high 2>&1 || { echo "CRITICAL / HIGH vulnerabilities found!"; exit 1; }',
    channels: ['telegram'],
    silentRule: 'Stay silent when npm audit finds 0 high/critical vulnerabilities.',
    dependencies: {
      integrations: ['shell'],
    },
    parameters: [
      { name: 'cwd', label: 'Working Directory', type: 'string', default: '.' },
    ],
  },
  {
    id: 'recipe_model_cost_summary',
    category: 'system',
    title: 'Daily Model Spend & Token Telemetry',
    description: 'Computes rolling 24h spend across all models and warns if daily cost exceeds threshold.',
    type: 'llm',
    schedule: '0 23 * * *',
    scheduleText: 'Every day at 23:00',
    prompt: 'Analyze token usage ledger across all active cron jobs. Provide cost breakdown per model and identify anomalies.',
    channels: ['telegram'],
    silentRule: 'Stay silent when total daily expenditure is under $0.10.',
    dependencies: {
      integrations: ['cron-store'],
    },
    parameters: [
      { name: 'thresholdUsd', label: 'Alert Threshold (USD)', type: 'number', default: 1.0 },
    ],
  },
];

/**
 * Validate recipe dependencies against host settings.
 * Returns { ok: boolean, missing: string[] }
 */
export function validateRecipeDependencies(recipe, settings = {}) {
  if (!recipe || !recipe.dependencies) return { ok: true, missing: [] };
  const missing = [];
  const deps = recipe.dependencies;

  if (Array.isArray(deps.credentials)) {
    for (const cred of deps.credentials) {
      if (!settings[cred] && !settings[cred.replace('Ref', '')]) {
        missing.push(`Credential: ${cred}`);
      }
    }
  }

  if (Array.isArray(deps.integrations)) {
    for (const integ of deps.integrations) {
      if (integ === 'gitea' && !settings.giteaBaseUrl) {
        missing.push('Integration: Gitea (giteaBaseUrl not configured)');
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function listVerifiedRecipes(settings = {}) {
  return EXTENDED_RECIPES.map((r) => {
    const depCheck = validateRecipeDependencies(r, settings);
    return {
      ...r,
      dependenciesValid: depCheck.ok,
      missingDependencies: depCheck.missing,
    };
  });
}
