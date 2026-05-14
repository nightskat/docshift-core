# chore(maintenance): scheduled dependency + docs upkeep automation for Jules

## Depends on

Issue #4 (CI/publish) must be merged first.

## Context

Jules can maintain this package autonomously after initial setup.
This issue sets up a weekly automation that:
1. Checks for outdated dependencies (patch + minor only)
2. Runs `npm audit`
3. Opens a bounded PR with results — max 1 PR per week
4. Never bumps major versions without human approval

## Files to create

```
.github/workflows/maintenance.yml
.github/PULL_REQUEST_TEMPLATE.md
```

## `.github/workflows/maintenance.yml`

```yaml
name: Weekly Maintenance

on:
  schedule:
    - cron: '0 2 * * 1'   # Monday 02:00 UTC
  workflow_dispatch:        # allow manual trigger

permissions:
  contents: write
  pull-requests: write

jobs:
  maintenance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check outdated (patch + minor only)
        id: outdated
        run: |
          OUTPUT=$(npm outdated --json 2>/dev/null || echo '{}')
          echo "$OUTPUT" > /tmp/outdated.json
          echo "output=$OUTPUT" >> $GITHUB_OUTPUT

      - name: Update patch + minor versions
        run: npm update --save

      - name: Run audit
        id: audit
        run: |
          AUDIT=$(npm audit --omit=dev --json 2>/dev/null || echo '{}')
          echo "$AUDIT" > /tmp/audit.json
          VULN_COUNT=$(echo "$AUDIT" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.metadata?.vulnerabilities?.total ?? 0)" 2>/dev/null || echo 0)
          echo "vuln_count=$VULN_COUNT" >> $GITHUB_OUTPUT

      - name: Run lint + test + build to verify updates are safe
        run: npm run lint && npm run test && npm run build

      - name: Build PR body
        id: body
        run: |
          OUTDATED=$(cat /tmp/outdated.json)
          AUDIT=$(cat /tmp/audit.json)
          cat > /tmp/pr_body.md << 'PREOF'
          ## Weekly Maintenance

          ### Updated dependencies (patch/minor only)

          ```json
          PREOF
          echo "$OUTDATED" >> /tmp/pr_body.md
          cat >> /tmp/pr_body.md << 'PREOF'
          ```

          ### Security audit

          ```json
          PREOF
          echo "$AUDIT" >> /tmp/pr_body.md
          cat >> /tmp/pr_body.md << 'PREOF'
          ```

          ### CI results
          - [x] lint passed
          - [x] tests passed
          - [x] build passed

          ### Breaking change check
          - [ ] none (patch/minor only — no major bumps)

          > To allow a major version bump, add label `allow-major` and re-run this workflow.
          PREOF
          echo "path=/tmp/pr_body.md" >> $GITHUB_OUTPUT

      - name: Open maintenance PR
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: "chore(deps): weekly patch/minor update"
          title: "chore(deps): weekly maintenance — ${{ github.run_id }}"
          body-path: /tmp/pr_body.md
          branch: chore/weekly-maintenance
          delete-branch: true
          labels: maintenance,dependencies
```

## `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Summary

<!-- What does this PR change? -->

## Type

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] chore — maintenance / deps
- [ ] docs — documentation only

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes

## Breaking changes

- [ ] None
- [ ] Yes — describe: ___

## Notes for Jules (automated PRs)

If this is a dependency update PR:
- Major version bumps require label `allow-major` before merge
- Check `npm audit` output in PR body before approving
```

## Acceptance criteria

- [ ] Workflow triggers every Monday at 02:00 UTC and on `workflow_dispatch`
- [ ] Only patches patch + minor versions — never bumps major automatically
- [ ] Opens at most 1 PR per run (uses `create-pull-request` with fixed branch name)
- [ ] PR body includes: changed deps JSON, audit JSON, CI pass/fail markers
- [ ] Workflow fails fast if lint/test/build fails after update (no PR opened for broken state)
- [ ] PR template added for human PRs
- [ ] No hardcoded secrets — uses `GITHUB_TOKEN` only
