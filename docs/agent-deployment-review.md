# Fresh-agent deployment review

## Scope and evidence

This review follows the Owner's first deployment through `README.md` and `docs/operations.md`, then traces the release scripts. Domain terminology follows `CONTEXT.md:5-9`. Source citations refer to commit `5cbf048`.

Observed means directly read in repository files or produced by a local probe. Inferred means a predicted consequence that this review did not reproduce on the target platform.

The probes ran on Linux with Node.js `v24.13.0` and npm `11.6.2`. They inspected dependency metadata and exercised a deliberately nonexistent executable. No deployment command, authentication command, credential access, remote database operation, or cloud resource creation occurred. Independent clean-install probes used `git archive HEAD` in `/tmp/startree-first-deploy-pxt5P9`, without `node_modules`, build output, or private deployment configuration. `npm ci` with a fresh npm cache and `npm run verify:deploy` both exited 0 on Linux with Node.js `24.13.0` and npm `11.6.2`. The same installation and verification passed with Node.js `22.23.3`, matching the reported runtime, and another fresh npm cache. Logs are local artifacts at `/tmp/startree-first-deploy-install.log`, `/tmp/startree-first-deploy-verify.log`, and `/tmp/startree-first-deploy-node22.log`. The installation reported 18 audit vulnerabilities; a successful installation is not a security audit. Native Windows was not available.

## Implementation follow-up

The findings below describe commit `5cbf048`, not the current working tree. The README and operations guide now name the POSIX deployment environment, direct Windows readers to WSL with Linux Node and npm, and require local installation and `verify:deploy` before cloud setup. They document evidence-based installation recovery without changing pins, omitting required dependencies, or disabling TLS.

`scripts/process.mjs` now preserves spawn error codes in a sanitized cause without retaining raw arguments. It rejects native Windows with WSL guidance. `scripts/process.test.mjs` covers a real missing executable, nonzero child exits, and a child-process simulation of `process.platform === 'win32'`. That simulation is not native Windows verification.

Node guidance now recommends Node.js 22 LTS at 22.18 or later within the 22.x line, with npm 11, rather than promising every version above 22.18. It also accepts existing Node.js 24 LTS installations at 24.11 or later without requiring a downgrade. Those ranges follow the locked build-tool engine metadata. Verified combinations are evidence, not mandatory exact versions. The existing package engine declaration is unchanged. An additional parent probe passed `npm run verify:deploy` on Node.js `22.18.0` using already installed dependencies in the same temporary checkout, logged at `/tmp/startree-first-deploy-node-minimum.log`. This establishes verification on 22.18.0, not a clean installation under that runtime. Dependency engine metadata does not establish support for every intervening Node version.

## Overview

The guide has useful safety boundaries. It requires Access before deployment, keeps private deployment values outside source, separates preview and production, and requires a clean pushed production commit. These requirements appear in `README.md:49-62` and `docs/operations.md:24-41`. The scripts validate configuration before production's Git fetch and run checks before remote migrations in `scripts/deploy.mjs:10-28` and `scripts/release-safety.mjs:34-71`.

At the reviewed commit, the main gaps were an unstated shell requirement, native Windows subprocess handling, an overly broad Node version promise, and no dependency-download recovery path. The implementation follow-up above addresses the documented agent path without adding native Windows support.

## Findings

### 1. Native Windows has both documentation and subprocess blockers

**Observed.** The setup requires `chmod 600` and shows POSIX inline environment assignments without naming the required shell. See `README.md:49,60` and `docs/operations.md:19-22,69-74`. Neither entry document provides a native Windows or WSL path.

**Observed.** The release wrapper launches bare `npm` and `npx` through `spawnSync` without a shell or platform-specific launcher. See `scripts/process.mjs:3-9` and `scripts/release-safety.mjs:40-43,58-71`. Remote D1 helpers also launch bare `npx` in `scripts/cloudflare.mjs:24-28`. CI runs on Ubuntu only in `.github/workflows/ci.yml:13,27`.

**Inferred.** A standard native Windows Node installation exposes npm and npx through command shims. This subprocess strategy is not a reliable way to execute those shims. After valid configuration and Git checks, the first release step can fail before verification starts. Changing the pasted commands to PowerShell syntax alone does not repair that internal launch path. Git Bash with Windows Node also does not establish that Node's child-process calls are portable.

**Recommendation.** State the supported operating system and shell before `npm ci`. Until native Windows is tested, direct Windows readers to WSL with Linux Node and npm installed inside WSL, and explicitly mark native PowerShell and Command Prompt deployment as unsupported. If native support is intended, fix the shared launcher and prove it with Windows tests before publishing PowerShell instructions. Cover both `npm` verification and `npx` CLI execution. Do not present `chmod` as a Windows ACL solution.

### 2. The subprocess error hides the actionable cause

**Observed.** `scripts/process.mjs:11-18` reports status but discards `result.error`. A safe local probe produced exactly this message:

```text
startree-audit-nonexistent-command  failed with status unknown
```

The probe was:

```sh
node --input-type=module -e "import { run } from './scripts/process.mjs'; try { run('startree-audit-nonexistent-command', [], {capture:true}); } catch(e) { console.log(e.message); }"
```

**Inferred.** An agent diagnosing a missing executable, broken PATH, or unsupported launcher receives an ambiguous status instead of the process creation error. This makes the Windows issue harder to distinguish from a failing application check.

**Recommendation.** Preserve the process creation error code and executable name when a child never starts. Keep this separate from a nonzero child exit. Add a local test for a missing executable. Avoid dumping environment variables or credentials into diagnostics.

### 3. "Node.js 22.18 or newer" overstates the supported range

**Observed.** `README.md:41`, `docs/operations.md:7,164`, and `package.json:58-61` advertise Node `>=22.18.0` with npm 11. However, locked `vite-plus@0.2.9` declares `^20.19.0 || ^22.18.0 || >=24.11.0` in `package-lock.json:9457-9490`. The locked Vite core has the same range in `package-lock.json:4578-4594`.

A local `semver.satisfies` probe against those lockfile values accepted `22.18.0` and rejected both `23.0.0` and `24.0.0`. Those rejected versions satisfy the project's advertised minimum. This is an observed metadata mismatch, not a reproduced application crash.

**Observed.** The optional Linux x64 LZMA package has a stricter range, `^22.20 || ^24.12 || >=25`, in `package-lock.json:2970-2986`. Its optional status prevents treating that declaration alone as proof that Node 22.18 cannot deploy. The local probe confirmed that its range rejects 22.18 and 24.11. CI selects moving Node major `22`, not the documented minimum, in `.github/workflows/ci.yml:19-23,37-41`.

**Recommendation.** Publish the specific Node and npm versions that pass the parent's clean-install and predeploy tests. Express supported major-version ranges rather than an unrestricted minimum, and test the claimed minimum. Do not raise the minimum solely because an optional package has a stricter engine declaration. Include `node --version` and `npm --version` in the first-time preflight. `package.json:61` already records npm `11.5.2`, which the guide can distinguish from a generic npm 11 prerequisite.

### 4. Dependency-download failures have no recovery guidance

**Observed.** Both deployment introductions lead with `npm ci` and then authentication or provisioning, without a failure branch. See `README.md:41-49` and `docs/operations.md:7-15`. A search of both complete documents found no guidance for registry failures, proxies, certificates, or failed downloads. The only separate installation guidance concerns optional browser testing in `README.md:83`.

**Observed.** The deployment tools are development dependencies in `package.json:39-52`. The lockfile includes registry tarballs and platform-specific optional Vite packages in `package-lock.json:9457-9500`. Deployment is browser-free, but it still needs build tools and a local Worker runtime. Migration validation executes local D1 in `scripts/verify-migrations.mjs:1-15`.

**Inferred.** A restricted network or incomplete installation can stop deployment before any application defect exists. An agent without recovery instructions may substitute a global CLI, omit development or optional dependencies, regenerate the lockfile, or install browsers unnecessarily. No download failure was induced or observed in this review.

**Recommendation.** Add a short troubleshooting branch beside `npm ci`:

- Stop before authentication or provisioning if installation fails. Record the failing package, hostname, error code, operating system, and Node and npm versions. Redact tokens and authenticated URLs before sharing logs.
- Distinguish DNS or timeout failures, proxy or certificate failures, engine mismatches, and missing native packages. Retry the unchanged `npm ci` after correcting the specific network or environment problem.
- Use the approved registry, proxy, and CA configuration. Do not disable TLS verification or replace packages with arbitrary mirrors.
- Keep the committed lockfile and required development and platform dependencies. Do not use `--omit=dev` as a deployment shortcut.
- Do not replace the pinned `cf` with a global latest CLI or generic Wrangler instructions. The project pins the CLI and describes beta-specific adapters in `package.json:45,52` and `docs/operations.md:158-164`.
- Run `npm run verify:deploy` once installation succeeds. Chromium is not a remedy for a deployment-check failure.

The independent clean-install tests passed, so they supplied no failing hostname or package. This report does not invent a download endpoint beyond the checked lockfile entries.

### 5. The first-time sequence discovers local blockers after cloud provisioning

**Observed.** First-time deployment authenticates and creates two databases before invoking the first deployment check in `docs/operations.md:9-29`. The browser-free verification command exists, but appears later in the deployment explanation at `docs/operations.md:76` and in the README's development section at `README.md:83`.

**Observed.** `verify:deploy` includes checks, tests, build, local migration validation, synthetic environment validation, and Notes loading checks in `package.json:23`. Environment validation supplies `deploymentFixture` rather than private configuration in `scripts/verify-environments.mjs:1-8`. Release commands load private configuration first in `scripts/deploy.mjs:10`, so they are not substitutes for a configuration-free preflight.

**Inferred.** A fresh agent following the numbered guide can create resources before discovering an unsupported runtime or missing build dependency. This adds avoidable cleanup and confusion even though the release itself fails closed.

**Recommendation.** Put `npm run verify:deploy` immediately after `npm ci`, before CLI login and database creation. Require a successful result before proceeding. Keep the existing verification inside each release command. Explain that the standalone check validates the local toolchain with synthetic configuration, not Cloudflare credentials, private IDs, or Access policies.

## Final verification

The updated working tree passed `npm run verify:deploy` on Linux with Node.js `24.13.0` and npm `11.6.2`, including 165 application tests and 19 script tests. The three launcher regressions failed before the fix and passed afterward. Formatting and `git diff --check` also passed. The verification log is `/tmp/startree-deployment-improvements-verify.log`.

The parent independently copied the updated launcher and tests into the clean temporary checkout and reran the guide's exact `npm ci --include=dev --include=optional` command with another empty cache under Node.js `22.23.3`. Installation and full `verify:deploy` passed. The parent-reported log is `/tmp/startree-retry-verify.log`. No cloud authentication, provisioning, or deployment was performed for these checks.

## Remaining verification boundaries

The report does not establish that the Access configuration can be completed in a brand-new Cloudflare account solely from these instructions. The guide states the required policies and request paths in `docs/operations.md:35-43`, but this review did not open a dashboard or test Access. Preserve that prerequisite rather than bypassing it to make deployment appear successful.

Clean `npm ci` and `verify:deploy` passed on the two Linux runtimes recorded above. This does not reproduce the friend's original dependency failure or establish that their agent had registry access. A successful Linux run does not resolve the inferred native Windows failure. Native Windows remains untested and unsupported. The later 22.18.0 verification probe used existing dependencies, so clean installation on that minimum remains unverified.
