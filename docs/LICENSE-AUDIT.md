# Licence audit

Generated on 2026-10-30 by reading every `node_modules/**/package.json` licence field. Policy (DECISIONS.md D-004, hackathon T&C clause 6.1): permissive licences only; no GPL/AGPL/LGPL/SSPL or other copyleft; no scraped datasets.

**Result: no copyleft licences found** across 56 installed packages (runtime + dev tooling).

Licence counts: MIT ×51, Apache-2.0 ×2, ISC ×2, BSD-3-Clause ×1.

Runtime dependency shipped with the code: `zod` (MIT). Dev tooling only (not part of the artefact): `typescript` (Apache-2.0), `tsx` (MIT), `vitest` (MIT), `@types/node` (MIT) and their transitive dependencies below.

Data: fully synthetic, produced by `src/data/generate.ts` from a seed; no scraped or third-party datasets. Models: called through OpenRouter under its terms; no weights are included or redistributed. Node.js built-ins (`node:sqlite`) are MIT.

| package | licence |
|---|---|
| @esbuild/win32-x64@0.28.2 | MIT |
| @jridgewell/sourcemap-codec@1.6.0 | MIT |
| @rollup/rollup-win32-x64-gnu@4.67.2 | MIT |
| @rollup/rollup-win32-x64-msvc@4.67.2 | MIT |
| @types/chai@5.2.3 | MIT |
| @types/deep-eql@4.0.2 | MIT |
| @types/estree@1.0.10 | MIT |
| @types/node@24.19.2 | MIT |
| @vitest/expect@3.2.7 | MIT |
| @vitest/mocker@3.2.7 | MIT |
| @vitest/pretty-format@3.2.7 | MIT |
| @vitest/runner@3.2.7 | MIT |
| @vitest/snapshot@3.2.7 | MIT |
| @vitest/spy@3.2.7 | MIT |
| @vitest/utils@3.2.7 | MIT |
| assertion-error@2.0.1 | MIT |
| cac@6.7.14 | MIT |
| chai@5.3.3 | MIT |
| check-error@2.1.3 | MIT |
| debug@4.4.3 | MIT |
| deep-eql@5.0.2 | MIT |
| es-module-lexer@1.7.0 | MIT |
| esbuild@0.28.2 | MIT |
| estree-walker@3.0.3 | MIT |
| expect-type@1.4.0 | Apache-2.0 |
| fdir@6.5.0 | MIT |
| js-tokens@9.0.1 | MIT |
| loupe@3.2.1 | MIT |
| magic-string@0.30.21 | MIT |
| ms@2.1.3 | MIT |
| nanoid@3.3.20 | MIT |
| pathe@2.0.3 | MIT |
| pathval@2.0.1 | MIT |
| picocolors@1.1.1 | ISC |
| picomatch@4.0.7 | MIT |
| postcss@8.5.32 | MIT |
| rollup@4.67.2 | MIT |
| siginfo@2.0.0 | ISC |
| source-map-js@1.2.2 | BSD-3-Clause |
| stackback@0.0.2 | MIT |
| std-env@3.10.0 | MIT |
| strip-literal@3.1.0 | MIT |
| tinybench@2.9.0 | MIT |
| tinyexec@0.3.2 | MIT |
| tinyglobby@0.2.17 | MIT |
| tinypool@1.1.1 | MIT |
| tinyrainbow@2.0.0 | MIT |
| tinyspy@4.0.6 | MIT |
| tsx@4.23.15 | MIT |
| typescript@5.9.3 | Apache-2.0 |
| undici-types@7.24.6 | MIT |
| vite-node@3.2.4 | MIT |
| vite@7.3.7 | MIT |
| vitest@3.2.7 | MIT |
| why-is-node-running@2.3.0 | MIT |
| zod@3.25.76 | MIT |
