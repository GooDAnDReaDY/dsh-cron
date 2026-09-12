/**
 * Built-in recipe hub (#48): preconfigured monitoring jobs a user can create in
 * one click instead of hand-writing shell commands.
 *
 * Two rules shape every entry:
 *   - read-only. No recipe deletes, prunes, restarts or installs anything; the
 *     worst a bad match can do is print output. Destructive maintenance stays a
 *     deliberate, hand-written task.
 *   - no secrets and no private endpoints. Everything here is a public command
 *     or a self-contained check.
 *
 * Recipes are ordinary task presets: the UI opens the normal form with the
 * fields prefilled, so nothing is created without an explicit action.
 */

export const RECIPE_CATEGORIES = [
  { id: 'system', title: 'System health' },
  { id: 'services', title: 'Services and containers' },
  { id: 'storage', title: 'Storage' },
  { id: 'security', title: 'Security' },
  { id: 'maintenance', title: 'Maintenance windows' },
  { id: 'ci', title: 'CI & Code review' },
];

/** Commands a recipe must never contain, checked by the test suite. */
/**
 * Commands a recipe must never contain, checked by the test suite.
 *
 * Deliberately broad: this is a gate for the curated catalog, not a sandbox, so
 * a false positive costs one recipe while a false negative ships a recipe that
 * destroys something. An independent review of this block defeated the first
 * version with `find -delete`, `shred`, `mv` and `apt purge`, so the list now
 * covers deletion and wiping, raw device writes, service and container state,
 * packages, users and permissions, scheduling and the network edge, power state
 * and writes outside the working tree.
 */
export const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\bunlink\b/i,
  /\bshred\b/i,
  /\bwipefs\b/i,
  /\bmkfs\b/i,
  /\btruncate\b/i,
  /\bfind\b[^|;]*\s-delete\b/i,
  /\bmv\s+[^|;]*\/etc\//i,
  /\bdd\b/i,
  /\bof=\/dev\//i,
  /\bsystemctl\s+(stop|restart|disable|mask|kill)\b/i,
  /\bkill(all)?\b/i,
  /\bdocker\s+(?:[a-z-]+\s+)*(rm|rmi|prune|stop|kill|down)\b/i,
  /\bdocker\s+volume\s+rm\b/i,
  /\bapt(-get)?\s+(install|remove|purge|autoremove|upgrade|dist-upgrade|full-upgrade)\b/i,
  /\bdpkg\s+(-r|-P|--purge)\b/i,
  /\byum\s+(remove|erase|update|install)\b/i,
  /\bpip3?\s+uninstall\b/i,
  /\bnpm\s+(uninstall|rm)\b/i,
  /\buserdel\b/i,
  /\bgroupdel\b/i,
  /\bchmod\s+(-R\s+)?0?777\b/i,
  /\bchown\s+-R\b/i,
  /\bcrontab\s+-r\b/i,
  /\biptables\b/i,
  /\bnft\s+(flush|delete)\b/i,
  /\bufw\s+disable\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\bpoweroff\b/i,
  />\s*\/(etc|var|usr|boot)\//i,
  /\btee\s+\/(etc|var|usr|boot)\//i,
  /\bsed\s+-i\b/i,
];

export const RECIPES = [
  {
    id: 'recipe_disk_pressure',
    category: 'system',
    title: 'Disk pressure',
    description: 'Report partitions above 80% usage; stay quiet when everything is comfortable.',
    type: 'script',
    schedule: '0 8 * * *',
    scheduleText: 'Every day at 08:00',
    prompt: "df -h -x tmpfs -x devtmpfs | awk 'NR==1 || $5+0 > 80'",
    channels: ['telegram'],
    silentRule: 'Stay silent when no filesystem in the output is above 80% usage. Otherwise report the offending lines.',
  },
  {
    id: 'recipe_memory_pressure',
    category: 'system',
    title: 'Memory and swap pressure',
    description: 'Report memory and swap state; stay quiet while swap stays untouched.',
    type: 'script',
    schedule: '0 */6 * * *',
    scheduleText: 'Every 6 hours',
    prompt: 'free -m && echo "---" && uptime',
    channels: ['telegram'],
    silentRule: 'Stay silent when swap used is 0 MB and the load average is below the number of CPU cores. Otherwise report the numbers.',
  },
  {
    id: 'recipe_failed_units',
    category: 'services',
    title: 'Failed systemd units',
    description: 'List failed units; stay quiet when the list is empty.',
    type: 'script',
    schedule: '0 * * * *',
    scheduleText: 'Every hour',
    prompt: 'systemctl --failed --no-pager --no-legend',
    channels: ['telegram'],
    silentRule: 'Stay silent when the output lists no failed units. Otherwise report every failed unit.',
  },
  {
    id: 'recipe_journal_errors',
    category: 'services',
    title: 'Errors in the journal',
    description: 'Surface error-level journal entries from the last day.',
    type: 'script',
    schedule: '30 8 * * *',
    scheduleText: 'Every day at 08:30',
    prompt: "journalctl -p err --since '24 hours ago' --no-pager | tail -n 40",
    channels: ['telegram'],
    silentRule: 'Stay silent when the output contains no error lines. Otherwise summarise what is failing repeatedly.',
  },
  {
    id: 'recipe_container_health',
    category: 'services',
    title: 'Container health',
    description: 'List containers that are not Up; skip the task silently without Docker.',
    type: 'script',
    schedule: '*/30 * * * *',
    scheduleText: 'Every 30 minutes',
    prompt: "command -v docker >/dev/null 2>&1 || { echo 'docker is not installed'; exit 0; }; docker ps --format '{{.Names}}\\t{{.Status}}\\t{{.Image}}'",
    channels: ['telegram'],
    silentRule: 'Stay silent when every listed container is Up and no container is restarting. Otherwise report the unhealthy ones.',
  },
  {
    id: 'recipe_log_growth',
    category: 'storage',
    title: 'Log directory growth',
    description: 'Track the size of /var/log and the largest files inside it.',
    type: 'script',
    schedule: '0 9 * * 1',
    scheduleText: 'Mondays at 09:00',
    prompt: "du -sh /var/log 2>/dev/null; du -ah /var/log 2>/dev/null | sort -rh | head -n 10",
    channels: ['telegram'],
    silentRule: 'Stay silent when /var/log is smaller than 1 GB. Otherwise report the total and the largest files.',
  },
  {
    id: 'recipe_backup_freshness',
    category: 'storage',
    title: 'Backup freshness',
    description: 'Show the newest backup files so a stalled backup job becomes visible.',
    type: 'script',
    schedule: '0 7 * * *',
    scheduleText: 'Every day at 07:00',
    prompt: "ls -lt /var/backups 2>/dev/null | head -n 5 || echo 'no /var/backups directory'",
    channels: ['telegram'],
    silentRule: 'Stay silent when the newest backup file is less than 48 hours old. Report out loud when it is older or the directory is missing.',
  },
  {
    id: 'recipe_certificate_expiry',
    category: 'security',
    title: 'Certificate expiry',
    description: 'Report TLS certificates that expire within 30 days.',
    type: 'script',
    schedule: '0 8 * * 1',
    scheduleText: 'Mondays at 08:00',
    prompt: "find /etc/letsencrypt/live -name fullchain.pem 2>/dev/null | while read -r cert; do days=$(( ( $(date -d \"$(openssl x509 -enddate -noout -in \"$cert\" | cut -d= -f2)\" +%s) - $(date +%s) ) / 86400 )); echo \"$days days  $cert\"; done",
    channels: ['telegram'],
    silentRule: 'Stay silent when every certificate has more than 30 days left. Report the ones that expire sooner.',
  },
  {
    id: 'recipe_pending_updates',
    category: 'security',
    title: 'Pending package updates',
    description: 'Count upgradable packages without installing anything.',
    type: 'script',
    schedule: '0 10 * * 5',
    scheduleText: 'Fridays at 10:00',
    prompt: "command -v apt >/dev/null 2>&1 || { echo 'apt is not available'; exit 0; }; apt list --upgradable 2>/dev/null | tail -n +2 | wc -l",
    channels: ['telegram'],
    silentRule: 'Stay silent when there are no pending updates. Otherwise report the count and mention that applying them is a manual step.',
  },
  {
    id: 'recipe_uptime_review',
    category: 'maintenance',
    title: 'Weekly uptime review',
    description: 'A short weekly note with uptime, load and the kernel in use.',
    type: 'script',
    schedule: '0 9 * * 1',
    scheduleText: 'Mondays at 09:00',
    prompt: 'uptime && echo "---" && uname -r && echo "---" && df -h / | tail -n 1',
    channels: ['telegram'],
  },
  {
    id: 'recipe_pr_reviewer',
    category: 'ci',
    title: 'Autonomous PR Reviewer (#33)',
    description: 'Periodic inspection of open Pull Requests in Gitea with agent review analysis.',
    type: 'llm',
    schedule: '*/30 * * * *',
    scheduleText: 'Every 30 minutes',
    prompt: 'Check open Pull Requests in Gitea repository. Inspect changed diffs, evaluate code quality, verify test coverage and post a concise review summary.',
    channels: ['telegram', 'gitea'],
    silentRule: 'Stay silent when there are no open PRs or no new commits to review.',
  },
];

/** Detached copy of the catalog, safe to hand to the UI. */
export function listRecipes() {
  return RECIPES.map((recipe) => ({ ...recipe, channels: [...(recipe.channels || [])] }));
}

export function recipesByCategory() {
  return RECIPE_CATEGORIES.map((category) => ({
    ...category,
    recipes: listRecipes().filter((recipe) => recipe.category === category.id),
  }));
}

/**
 * The panel's "recommended" list: the same catalog, flattened, so the hub is
 * the single source instead of a second hand-written list (legacy shape kept).
 */
export function recipeRecommendations(limit = 6) {
  return listRecipes()
    .slice(0, limit)
    .map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      schedule: recipe.schedule,
      scheduleText: recipe.scheduleText,
      prompt: recipe.prompt,
      description: recipe.description,
      type: recipe.type,
      category: recipe.category,
      channels: recipe.channels,
      silentRule: recipe.silentRule || '',
    }));
}

/** A recipe must never contain a destructive command. */
export function findDestructiveRecipe(recipes = RECIPES) {
  for (const recipe of recipes) {
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(String(recipe.prompt || ''))) {
        return { id: recipe.id, pattern: String(pattern) };
      }
    }
  }
  return null;
}
