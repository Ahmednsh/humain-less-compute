// Builds docs/slides/deck.pptx (9 slides) from the numbers in results/report.md.
// usage: node docs/slides/build-deck.cjs   (needs `pptxgenjs` resolvable: npm i -g pptxgenjs, or NODE_PATH)
'use strict';
const path = require('node:path');
const pptxgen = require('pptxgenjs');

const THEME = {
  name: 'Less Compute',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1B2430', lt1: 'FFFFFF', dk2: '3C4858', lt2: 'EEF2F5',
    accent1: '0E9F8E', accent2: 'E07A2F', accent3: '2F6DB5', accent4: '7A8699', accent5: 'B9E4DD', accent6: 'F5D7C3',
    hlink: '0E9F8E', folHlink: '7A8699',
  },
};
const T = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = 'Ahmed Sharahili';
pres.title = 'Deliver AI with Less Compute';
pres.subject = 'HUMAIN Future AI Builders Hackathon 2026 - Challenge 2';
const C = pres.SchemeColor;

// ---------- layouts
pres.defineSlideMaster({
  title: 'DARK', background: { color: T.dk1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.5, w: 8.8, h: 1.3, fontSize: 40, bold: true, color: T.lt1, margin: 0, valign: 'bottom' }, text: 'Title' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.95, w: 8.8, h: 1.6, fontSize: 18, color: T.accent5, margin: 0, valign: 'top' }, text: 'Body' } },
    { text: { text: 'HUMAIN Future AI Builders Hackathon 2026 · Challenge 2 · Ahmed Sharahili', options: { x: 0.6, y: 5.1, w: 7.5, h: 0.3, fontSize: 10, color: T.accent4, margin: 0 } } },
  ],
});
pres.defineSlideMaster({
  title: 'LIGHT', background: { color: T.lt1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 8.8, h: 0.8, fontSize: 27, bold: true, color: T.dk1, margin: 0, valign: 'middle' }, text: 'Title' } },
    { text: { text: 'Deliver AI with Less Compute · github.com/Ahmednsh/humain-less-compute', options: { x: 0.6, y: 5.2, w: 7.6, h: 0.25, fontSize: 9, color: T.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 9.1, y: 5.2, w: 0.4, h: 0.25, fontSize: 9, color: T.accent4 },
});

const txt = (slide, text, o) => slide.addText(text, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', ...o });
const card = (slide, x, y, w, h, opts = {}) => slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill ?? T.lt2 }, line: { color: opts.line ?? T.lt2, width: 0.75 }, shadow: opts.noShadow ? undefined : { type: 'outer', color: '000000', blur: 4, offset: 1.5, angle: 90, opacity: 0.12 } });
const dot = (slide, x, y, label, fill = T.accent1) => {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: 0.42, h: 0.42, fill: { color: fill }, line: { color: fill, width: 0 } });
  txt(slide, label, { x, y, w: 0.42, h: 0.42, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: T.lt1 });
};

// ---------- 1 title
pres.addSection({ title: 'Opening' });
let s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Opening' });
s.addText('Deliver AI with Less Compute', { placeholder: 'title' });
s.addText([
  { text: 'A budget-aware controller for "ask-your-data" analytics: route each question to the right model, send only the schema it needs, verify only where a mistake is likely.', options: { breakLine: true } },
  { text: ' ', options: { breakLine: true, fontSize: 8 } },
  { text: '−68 % compute per correct answer on 150 unseen tasks, at −0.6 pp accuracy.', options: { bold: true, color: T.lt1 } },
], { placeholder: 'body' });
txt(s, 'Ahmed Sharahili · solo · 30–31 Oct 2026 · github.com/Ahmednsh/humain-less-compute', { x: 0.6, y: 4.6, w: 8.8, h: 0.3, fontSize: 12, color: T.accent4 });
s.addNotes('Opening: the one-line claim and the one number. 20 seconds.');

// ---------- 2 problem
pres.addSection({ title: 'Problem' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Problem' });
s.addText('Every question gets the biggest model and the whole context', { placeholder: 'title' });
const rows2 = [
  ['1', 'Tokens the task never reads', 'Full 12-table schema, a long glossary and nine examples on every call: 3 461 prompt tokens for "how many cities are in Asir".'],
  ['2', 'Failed runs still burn compute', 'Repairs, retries and verification calls cost money whether or not the answer ends up right, so the metric that matters is cost per successful task.'],
  ['3', 'Cheap only counts if it is right and on time', 'Any saving has to be judged under an accuracy floor and a latency floor fixed in advance.'],
];
rows2.forEach(([n, h, d], i) => {
  const y = 1.45 + i * 1.1;
  dot(s, 0.6, y + 0.05, n);
  txt(s, h, { x: 1.2, y, w: 4.6, h: 0.35, fontSize: 17, bold: true, color: C.text1 });
  txt(s, d, { x: 1.2, y: y + 0.38, w: 4.6, h: 0.65, fontSize: 12.5, color: C.text2 });
});
card(s, 6.3, 1.45, 3.1, 3.2, { fill: T.dk1, line: T.dk1 });
txt(s, '3 461', { x: 6.3, y: 1.7, w: 3.1, h: 0.9, fontSize: 54, bold: true, color: T.accent2, align: 'center', valign: 'middle' });
txt(s, 'prompt tokens per question in the baseline', { x: 6.5, y: 2.65, w: 2.7, h: 0.5, fontSize: 12, color: T.accent5, align: 'center' });
txt(s, '~1 000', { x: 6.3, y: 3.25, w: 3.1, h: 0.7, fontSize: 40, bold: true, color: T.accent1, align: 'center', valign: 'middle' });
txt(s, 'after pruning, same answers', { x: 6.5, y: 3.95, w: 2.7, h: 0.4, fontSize: 12, color: T.accent5, align: 'center' });
s.addNotes('Problem statement. The callout is measured on our dev set: full-context baseline vs pruned context.');

// ---------- 3 solution
pres.addSection({ title: 'Solution' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Solution' });
s.addText('One controller in front of two model tiers', { placeholder: 'title' });
txt(s, 'Small: Llama 3.3 70B · Large: Claude Sonnet 5.5 · both via OpenRouter · ≈20× price gap · the small tier was chosen by a measured bake-off, not by reputation', { x: 0.6, y: 1.2, w: 8.8, h: 0.35, fontSize: 12, color: C.text2 });
const steps = [
  ['Route', 'A zero-token lexical difficulty score sends easy questions to the small model and hard ones straight to the large one.'],
  ['Prune', 'Only the tables the question mentions plus the join path between them, the glossary lines it needs and at most two worked examples.'],
  ['Verify where it pays', 'Free checks on every answer. A large-model second opinion only for risky small-tier answers: low confidence, complex SQL or money.'],
  ['Escalate once', 'If checks fail, the large model takes over with the same pruned context. The failed attempt is still charged.'],
];
steps.forEach(([h, d], i) => {
  const x = 0.6 + i * 2.25;
  card(s, x, 1.75, 2.05, 2.9);
  dot(s, x + 0.2, 1.95, String(i + 1));
  txt(s, h, { x: x + 0.2, y: 2.45, w: 1.7, h: 0.7, fontSize: 15, bold: true, color: C.text1, valign: 'top' });
  txt(s, d, { x: x + 0.2, y: 3.2, w: 1.7, h: 1.4, fontSize: 11.5, color: C.text2 });
  if (i < 3) s.addShape(pres.ShapeType.rightArrow, { x: x + 2.07, y: 3.0, w: 0.16, h: 0.3, fill: { color: T.accent4 }, line: { color: T.accent4, width: 0 } });
});
txt(s, 'It is an agent in the challenge\'s sense: it observes outcomes (errors, empty results, verdicts) and decides where the next token goes.', { x: 0.6, y: 4.8, w: 8.8, h: 0.35, fontSize: 12, italic: true, color: C.text2 });
s.addNotes('The four decisions the controller makes per question. Emphasise: verification is applied only to small-tier answers; the large model never checks itself.');

// ---------- 4 technical approach
pres.addSection({ title: 'Approach' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Approach' });
s.addText('Technical approach', { placeholder: 'title' });
const flow = ['question', 'router', 'context builder', 'executor (SQL, read-only)', 'verifier', 'answer'];
flow.forEach((label, i) => {
  const y = 1.45 + i * 0.6;
  s.addShape(pres.ShapeType.roundRect, { x: 0.6, y, w: 3.3, h: 0.45, rectRadius: 0.06, fill: { color: i === 0 || i === 5 ? T.dk1 : T.accent1 }, line: { color: T.lt1, width: 0 } });
  txt(s, label, { x: 0.6, y, w: 3.3, h: 0.45, fontSize: 13, bold: true, color: T.lt1, align: 'center', valign: 'middle' });
  if (i < 5) s.addShape(pres.ShapeType.downArrow, { x: 2.1, y: y + 0.45, w: 0.3, h: 0.15, fill: { color: T.accent4 }, line: { color: T.accent4, width: 0 } });
});
s.addShape(pres.ShapeType.roundRect, { x: 4.05, y: 2.65, w: 1.1, h: 0.45, rectRadius: 0.06, fill: { color: T.accent2 }, line: { color: T.accent2, width: 0 } });
txt(s, 'escalate once', { x: 4.05, y: 2.65, w: 1.1, h: 0.45, fontSize: 10.5, bold: true, color: T.lt1, align: 'center', valign: 'middle' });
const bullets4 = [
  ['Data', 'Deterministic 12-table SQLite company (regions, cities, customers, orders, items, payments, shipments, returns, employees, tickets), 6 000 orders from one seed.'],
  ['Tasks', '33 question templates in three difficulty tiers, English and Arabic phrasings, gold SQL executed on the same DB: an exact, free oracle, hand-checked on a fixture.'],
  ['Agent', 'TypeScript on Node 26, node:sqlite in a killable child process with a deadline, write guard, JSON output parsed with zod, repair loop.'],
  ['Harness', 'Every call logged (tokens, USD from OpenRouter, latency); resumable JSONL runs; one command rebuilds the report from the logs.'],
];
bullets4.forEach(([h, d], i) => {
  const y = 1.4 + i * 0.92;
  txt(s, h, { x: 5.5, y, w: 3.9, h: 0.3, fontSize: 14, bold: true, color: C.text1 });
  txt(s, d, { x: 5.5, y: y + 0.3, w: 3.9, h: 0.6, fontSize: 11, color: C.text2 });
});
s.addNotes('Architecture left, stack right. The oracle is exact because the gold SQL runs on the same database.');

// ---------- 5 evaluation design
pres.addSection({ title: 'Evaluation' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Evaluation' });
s.addText('Floors fixed first, every component gets a row', { placeholder: 'title' });
const ladder = [['P0', 'large model always (baseline)'], ['S', 'small model only'], ['P1', '+ router'], ['P2', '+ context pruning'], ['P3', '+ selective verification = full system'], ['V', 'verify always (contrast)']];
card(s, 0.6, 1.4, 4.2, 3.3);
txt(s, 'The ablation ladder', { x: 0.85, y: 1.55, w: 3.8, h: 0.35, fontSize: 15, bold: true, color: C.text1 });
ladder.forEach(([k, v], i) => {
  const y = 1.98 + i * 0.44;
  txt(s, k, { x: 0.85, y, w: 0.5, h: 0.35, fontSize: 13, bold: true, color: T.accent1 });
  txt(s, v, { x: 1.4, y, w: 3.3, h: 0.35, fontSize: 12.5, color: C.text2 });
});
card(s, 5.1, 1.4, 4.3, 1.5);
txt(s, 'Floors, fixed before the first optimisation run', { x: 5.35, y: 1.55, w: 3.9, h: 0.35, fontSize: 14, bold: true, color: C.text1 });
txt(s, [
  { text: 'accuracy ≥ baseline − 2 pp', options: { bullet: true, breakLine: true } },
  { text: 'p95 latency ≤ 1.25 × baseline', options: { bullet: true, breakLine: true } },
  { text: 'headline metric: cost per successful task (failed and verified attempts included)', options: { bullet: true } },
], { x: 5.35, y: 1.95, w: 3.9, h: 0.9, fontSize: 11.5, color: C.text2, paraSpaceAfter: 2 });
card(s, 5.1, 3.05, 4.3, 1.65);
txt(s, 'Held-out protocol', { x: 5.35, y: 3.2, w: 3.9, h: 0.35, fontSize: 14, bold: true, color: C.text1 });
txt(s, [
  { text: '150 tasks, 6 question types never used in development', options: { bullet: true, breakLine: true } },
  { text: 'secret seed, file generated outside the repository, never opened', options: { bullet: true, breakLine: true } },
  { text: 'one run per policy after all thresholds were frozen', options: { bullet: true } },
], { x: 5.35, y: 3.6, w: 3.9, h: 1.0, fontSize: 11.5, color: C.text2, paraSpaceAfter: 2 });
txt(s, '106 unit/component tests · pruner recall measured (100 % of tasks get every table their gold SQL needs, 2.6 of 12 sent) · mock end-to-end run in CI on every push · 21 logged decisions', { x: 0.6, y: 4.85, w: 8.8, h: 0.35, fontSize: 11, color: C.text2 });
s.addNotes('Evaluation design. The floors and the held-out protocol were written in the decision log before any paid run.');

// ---------- 6 results
pres.addSection({ title: 'Results' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Results' });
s.addText('Results: dev ladder and held-out set', { placeholder: 'title' });
s.addChart(pres.ChartType.bar, [{ name: 'cost per correct answer (USD)', labels: ['P0 baseline', 'S small only', 'P1 router', 'P2 pruning', 'P3 full', 'V verify all'], values: [0.0086, 0.0003, 0.0047, 0.0028, 0.0030, 0.0068] }], {
  x: 0.5, y: 1.25, w: 5.2, h: 3.4, barDir: 'col', chartColors: [T.accent4, T.accent2, T.accent1, T.accent1, T.accent1, T.accent4],
  showTitle: true, title: 'Cost per correct answer, dev set (USD)', titleFontSize: 12, titleColor: T.dk1, titleFontFace: '+mn-lt',
  showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '$0.0000', dataLabelFontSize: 9, dataLabelColor: T.dk2, dataLabelFontFace: '+mn-lt',
  showLegend: false, catAxisLabelFontSize: 10, catAxisLabelColor: T.dk2, catAxisLabelFontFace: '+mn-lt', valAxisLabelFontSize: 9, valAxisLabelColor: T.accent4, valAxisLabelFontFace: '+mn-lt', valAxisLabelFormatCode: '$0.000',
  valGridLine: { color: 'E3E7EC', size: 0.5 }, catGridLine: { style: 'none' }, valAxisMaxVal: 0.01,
});
const res = [['P0', '100.0 %', '3.4 s', '—'], ['S', '84.7 %', '7.0 s', '−96 %'], ['P1', '98.0 %', '3.5 s', '−46 %'], ['P2', '99.3 %', '3.0 s', '−68 %'], ['P3', '100.0 %', '4.3 s', '−65 %'], ['V', '100.0 %', '7.1 s', '−21 %']];
const tableRows = [[{ text: 'policy', options: { bold: true } }, { text: 'accuracy', options: { bold: true } }, { text: 'p95', options: { bold: true } }, { text: 'Δ cost', options: { bold: true } }], ...res];
s.addTable(tableRows, { x: 5.9, y: 1.3, w: 3.5, colW: [0.7, 1.0, 0.8, 1.0], fontSize: 10.5, color: T.dk2, fontFace: 'Calibri', border: { type: 'solid', pt: 0.5, color: 'E3E7EC' }, fill: { color: 'FFFFFF' }, rowH: 0.27, align: 'left', valign: 'middle', margin: 0.04 });
card(s, 5.9, 3.35, 3.5, 1.35, { fill: T.dk1, line: T.dk1 });
txt(s, '−68 %', { x: 5.9, y: 3.4, w: 1.5, h: 0.8, fontSize: 36, bold: true, color: T.accent1, align: 'center', valign: 'middle' });
txt(s, 'cost per correct answer on 150 unseen tasks: $0.0093 → $0.0030, accuracy 99.3 % → 98.7 %, p95 3.1 s → 4.4 s', { x: 7.35, y: 3.45, w: 2.0, h: 1.2, fontSize: 10.5, color: T.accent5, valign: 'middle' });
txt(s, 'Robustness (P3, no retuning, 60 tasks each): renamed schema 100 % · Arabic questions 100 % · small model swapped to qwen3.7-flash 100 % but p95 29 s, which the controller exposes. Floors met by P1 and P2; P3 misses the p95 floor by 0.1 s (dev) / 0.5 s (held-out) and is reported as such.', { x: 0.6, y: 4.75, w: 8.8, h: 0.45, fontSize: 10, color: C.text2 });
s.addNotes('All numbers from results/report.md. Point at the chart: router halves cost, pruning is the biggest saving and is faster than the baseline, verify-always is dominated.');

// ---------- 7 innovation & value
pres.addSection({ title: 'Value' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Value' });
s.addText('Why this matters beyond the benchmark', { placeholder: 'title' });
const val = [
  ['Compute follows risk', 'Spend where the outcome is at risk, not uniformly. The same pattern fits any task with a cheap first-stage check: SQL execution, unit tests, schema validation.'],
  ['Measured, not asserted', 'Each component earns its own row; the naive extremes (always cheap, always verify) are shown to lose on the same tasks.'],
  ['Found by measurement, fixed early', 'Renamed-schema pruner recall 46.7 % → 100 %; Arabic 92.2 % → 100 %; a verifier that spent 85 % of its budget checking the large model against itself, removed.'],
  ['Honest accounting', 'Failed, repaired, verified and escalated attempts are all in the numerator. The one floor the full system misses is printed, not hidden.'],
];
val.forEach(([h, d], i) => {
  const x = 0.6 + (i % 2) * 4.5, y = 1.4 + Math.floor(i / 2) * 1.75;
  card(s, x, y, 4.3, 1.55);
  dot(s, x + 0.2, y + 0.2, String(i + 1), i % 2 ? T.accent2 : T.accent1);
  txt(s, h, { x: x + 0.75, y: y + 0.15, w: 3.4, h: 0.55, fontSize: 14, bold: true, color: C.text1, valign: 'top' });
  txt(s, d, { x: x + 0.2, y: y + 0.75, w: 3.9, h: 0.75, fontSize: 10.5, color: C.text2 });
});
s.addNotes('Innovation and value. Keep it to the four cards.');

// ---------- 8 challenges & future
pres.addSection({ title: 'Limits' });
s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: 'Limits' });
s.addText('Limitations and what comes next', { placeholder: 'title' });
card(s, 0.6, 1.4, 4.3, 3.3);
txt(s, 'Limitations', { x: 0.85, y: 1.55, w: 3.9, h: 0.4, fontSize: 16, bold: true, color: T.accent2 });
txt(s, [
  { text: 'Synthetic data and templated questions (paraphrased, not human-written)', options: { bullet: true, breakLine: true } },
  { text: 'One database domain; a lexical router', options: { bullet: true, breakLine: true } },
  { text: 'p95 floor (1.25 × one flagship call) missed by the full system by 0.1–0.5 s; pruning alone meets it', options: { bullet: true, breakLine: true } },
  { text: 'Model ids and prices are a 30 Oct 2026 snapshot of OpenRouter', options: { bullet: true, breakLine: true } },
  { text: 'Two days, one person', options: { bullet: true } },
], { x: 0.85, y: 2.0, w: 3.9, h: 2.6, fontSize: 12, color: C.text2, paraSpaceAfter: 4 });
card(s, 5.1, 1.4, 4.3, 3.3);
txt(s, 'Next', { x: 5.35, y: 1.55, w: 3.9, h: 0.4, fontSize: 16, bold: true, color: T.accent1 });
txt(s, [
  { text: 'A learned router trained on the logged traces', options: { bullet: true, breakLine: true } },
  { text: 'Prompt caching for the shared prefix; a third tier', options: { bullet: true, breakLine: true } },
  { text: 'Verifier calibration: false-accept rate against gold', options: { bullet: true, breakLine: true } },
  { text: 'Multi-turn sessions and real customer schemas', options: { bullet: true, breakLine: true } },
  { text: 'Latency-aware routing when a provider slows down', options: { bullet: true } },
], { x: 5.35, y: 2.0, w: 3.9, h: 2.6, fontSize: 12, color: C.text2, paraSpaceAfter: 4 });
s.addNotes('Say the limitations yourself before the judges do.');

// ---------- 9 conclusion
pres.addSection({ title: 'Close' });
s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Close' });
s.addText('68 % less compute per correct answer, inside the accuracy floor', { placeholder: 'title' });
s.addText([
  { text: 'On 150 unseen tasks, with the evidence to prove it: a measured baseline, one row per component, robustness under drift, and a held-out run nobody looked at.', options: { breakLine: true } },
  { text: ' ', options: { breakLine: true, fontSize: 8 } },
  { text: 'Repo and one-command reproduction: github.com/Ahmednsh/humain-less-compute', options: { breakLine: true, color: T.lt1 } },
  { text: 'Results: results/report.html · Decisions: DECISIONS.md · Demo video: see project page', options: { color: T.accent4 } },
], { placeholder: 'body' });
s.addNotes('Close with the number and the links.');

(async () => {
  const out = path.join(__dirname, 'deck.pptx');
  await pres.writeFile({ fileName: out });
  const { applyTheme } = require(process.env.PPTX_SKILL_DIR + '/scripts/apply_theme.js');
  await applyTheme(out, THEME);
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
