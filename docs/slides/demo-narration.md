# Demo recording — run of show (English narration, ≤ 3:00)

Keep this file open on a second screen or phone while recording. Each block gives the clock time it should **start**, what to **DO** on screen (not read aloud), and what to **SAY** (read aloud, verbatim). Times assume a calm pace of about 140 words per minute; the default take leaves out the sentences in ⟨angle brackets⟩ and lands at about 2:50. Add a bracketed sentence only if you are ahead of the checkpoint before it.

The demo set is `data/demo.jsonl` (8 tasks, easy → hard). Expected console lines, in order: price lookup `route=small tables=1`; count of cities `tables=2`; employees `route=small`; three revenue questions with `ver=1` (the fifth line is the Arabic one); margin ranking `route=large`; growth `route=large tables=5`. The run prints all eight in about 25 s. No `esc=1` appears on this set; the narration never promises one.

---

## Before pressing record (every take)

Windows open, in Alt+Tab order: slides → PowerShell → browser.

1. **Slides.** Preferred: `docs/slides/deck.pptx` in PowerPoint, press **F5**, stay on slide 1. Alternative: `deck.pdf` in Acrobat, **Ctrl+L** (full-screen; arrows move slides).
2. **PowerShell** in the project folder, font 18–20, window maximised. Run, in this order:

   ```powershell
   Remove-Item results\runs\demo-P3.jsonl
   cls
   ```

   Then **type** the demo command and leave it on the prompt **without pressing Enter**:

   ```powershell
   npm run cli -- eval --policy P3 --tasks data/demo.jsonl --db data/company.sqlite --limit 8 --concurrency 1
   ```

   (Skipping `Remove-Item` makes the run print "8 task(s) already logged will be skipped" and nothing else. Each take costs about $0.03.)
3. **Browser**, two tabs: tab 1 `results/report.html` scrolled to the top (dev ladder table); tab 2 the GitHub README scrolled to **Quick start**.
4. Windows **Do not disturb** on (Win+N). Phone on silent. Mic test of 10 s done.
5. Put the slides window in front, slide 1 showing. Start the recorder (full screen + microphone). Breathe, then begin.

---

## Run of show

### 0:00 → 0:22 · Slide 1

**DO:** nothing on screen; slide 1 stays up.

**SAY:**
Companies send every question to their biggest model, with the whole schema and the whole history. Most of that compute is wasted. This is a budget-aware controller for ask-your-data analytics: per question it decides which model to use, which tables to send, and when a second opinion is worth paying for.

### 0:22 → 0:32 · Slide 4

**DO:** press **→** three times (slide 1 → 4) as you start the sentence.

**SAY:**
The data is a twelve-table company database, and there are two model tiers, small and large, about twenty times apart in price.

### 0:32 → 1:22 · PowerShell — the live run

**DO:** **Alt+Tab** to PowerShell, press **Enter** on the first word of the first sentence. Lines appear one by one from about 0:35 to 0:58. Do not wait for them in silence and do not try to match each line as it prints: keep reading, and move the mouse pointer onto the line you are talking about (pointer on `tables=1` of line 1; on `ver=1` of lines 4–5; on `tables=5` of line 8).

Checkpoint: Enter pressed by **0:35** at the latest.

**SAY:**
Let me run eight questions, easy to hard, through the full system. Watch the decisions.
A price lookup goes to the small model with one table instead of twelve, for three hundredths of a cent. ⟨A count over cities gets two tables.⟩
Now a revenue total: that is a money number, so the small model's answer gets a second opinion from the large model before it is trusted. That is the ver=1.
The Arabic question takes exactly the same path, with no special handling.
The last one, year-over-year growth by region, scores high on the router and goes straight to the large model with the five tables it needs.
⟨If a cheap answer ever fails its free checks or the verifier rejects it, the controller escalates once, and the failed attempt stays in the bill. On this set nothing needed it.⟩
Every line is a logged JSON row with tokens, cost and latency.

### 1:22 → 2:02 · report.html — the six-policy ladder

**DO:** **Alt+Tab** to the browser, tab 1. Move the pointer slowly down the rows as you name them: **P0** (baseline) → **S** (small only) → **P1** (router) → **P2** (pruning) → **P3** (full system) → **V** (verify always). Rest the pointer on the cost column of P3 while saying "seven percent".

Checkpoint: browser on screen by **1:25**.

**SAY:**
Same one hundred and fifty questions, six policies. The baseline is the large model on everything: one hundred percent accuracy at under a cent per correct answer.
Small model only is cheap but loses accuracy on the hard questions.
Adding the router cuts cost per correct answer by forty-six percent. Adding context pruning takes it to sixty-eight. Selective verification brings accuracy back to one hundred while verifying only seven percent of questions. Verify-always gets the same accuracy at more than twice the cost.
So each component earns its row, and both naive extremes lose.

### 2:02 → 2:20 · report.html — robustness tables

**DO:** scroll down to the **R1 / R2 / R3** tables; pointer on the verified-% column of R1, then on the p95 column of the R3 qwen row.

**SAY:**
Under a renamed schema, Arabic questions and a swapped small model, with no retuning, accuracy holds and the controller adapts: it verifies more when the schema is unfamiliar, and it exposes the latency of the slower swapped model instead of hiding it.

### 2:20 → 2:41 · report.html — held-out table

**DO:** scroll to the **held-out** table; pointer on the P3 row, cost column.

Checkpoint: held-out table on screen by **2:22**. If you are more than 10 s behind here, drop the last clause of the previous block ("and it exposes … hiding it") next take, not this sentence.

**SAY:**
The final numbers come from a held-out set: one hundred and fifty tasks generated with a secret seed outside the repository, including six question types never seen during development, run once after freezing every threshold. Sixty-eight percent less cost per correct answer, at zero point six points lower accuracy.

### 2:41 → 2:50 · GitHub README — Quick start

**DO:** click browser **tab 2** (README at Quick start). Say the lines, hold one full second of silence after "Thank you", then **stop the recorder**.

**SAY:**
Limitations: synthetic data, one domain, a lexical router, two days, one person. Everything is reproducible from one command. Thank you.

---

## Checkpoints at a glance

| clock | you should be |
|---|---|
| 0:22 | pressing → to slide 4 |
| 0:32–0:35 | pressing Enter in PowerShell |
| 1:22–1:25 | switching to the browser |
| 2:02 | scrolling to R1 / R2 / R3 |
| 2:20–2:22 | on the held-out table |
| 2:41 | on the README tab |
| ≤ 2:55 | recorder stopped |

## Retake rules

- A stumble on one word is not a retake. Retake only if the video runs past 3:00, the audio drops, or a notification appears.
- Over 3:00? Next take, keep both ⟨⟩ sentences out and read the slide-1 block a touch faster.
- Three takes maximum; keep the best one.
- Before every retake: `Remove-Item results\runs\demo-P3.jsonl`, `cls`, retype the command without Enter, slides back to slide 1, report tab scrolled to the top.

## After the last take

1. Play it back once: length ≤ 3:00, audio clear from the first word, console text readable, no pop-ups.
2. Upload: Loom (link ready, sharing "Anyone with the link") or YouTube **Unlisted** or Google Drive "Anyone with the link: Viewer".
3. Open the link in an incognito window or on a phone without signing in. If it asks for a login, fix the sharing setting.
4. Put the link in `docs/submission.md` (Links → Demo video) before publishing the platform page.

---

## Appendix — Arabic narration (same beats and timings; not used in the English take)

**[0:00 — الشريحة 1 من deck.pdf]**
الشركات ترسل كل سؤال إلى أكبر نموذج عندها، ومعه كامل الـ schema وكامل السجل. أغلب هذا الحساب يضيع. هذا المشروع controller واعٍ بالميزانية لتحليلات "اسأل بياناتك": لكل سؤال يقرر أي نموذج يستخدم، وأي جداول يرسل، ومتى يستحق الرأي الثاني ثمنه.

**[0:22 — الشريحة 4]**
البيانات قاعدة شركة من اثني عشر جدولاً، والنماذج مستويان: صغير وكبير، بينهما نحو عشرين ضعفاً في السعر.

**[0:32 — PowerShell، نفّذ الأمر]**
سأمرّر ثمانية أسئلة، من السهل إلى الصعب، عبر النظام الكامل. راقبوا القرارات.
سؤال سعر منتج يذهب إلى النموذج الصغير بجدول واحد بدل اثني عشر، بثلاثة أجزاء من مئة من السنت. ⟨عدّ المدن يأخذ جدولين.⟩
الآن إجمالي إيرادات: هذا رقم مالي، فجواب النموذج الصغير يأخذ رأياً ثانياً من النموذج الكبير قبل أن يُعتمد، وهذا معنى ver=1.
السؤال العربي يسلك المسار نفسه تماماً، بلا أي معالجة خاصة.
السؤال الأخير، النمو السنوي حسب المنطقة، يسجّل درجة عالية عند الموجّه فيذهب مباشرة إلى النموذج الكبير مع الجداول الخمسة التي يحتاجها.
⟨لو فشل جواب رخيص في الفحوص المجانية أو رفضه المتحقق، يصعّد الـ controller مرة واحدة، والمحاولة الفاشلة تبقى في الفاتورة. في هذه المجموعة لم يحتج لذلك.⟩
كل سطر هنا صف JSON مسجّل بالتوكنات والتكلفة والزمن.

**[1:22 — المتصفح، report.html، مرّر على الصفوف P0 → S → P1 → P2 → P3 → V]**
نفس المئة والخمسين سؤالاً، ست سياسات. الأساس هو النموذج الكبير على كل شيء: دقة مئة بالمئة بأقل من سنت لكل إجابة صحيحة.
النموذج الصغير وحده رخيص لكنه يخسر الدقة في الأسئلة الصعبة.
إضافة الموجّه تخفض التكلفة لكل إجابة صحيحة ستة وأربعين بالمئة. إضافة تقليم السياق توصلها إلى ثمانية وستين بالمئة. التحقق الانتقائي يعيد الدقة إلى مئة بالمئة وهو يتحقق من سبعة بالمئة من الأسئلة فقط. والتحقق على كل شيء يعطي الدقة نفسها بأكثر من ضعف التكلفة.
إذن كل مكوّن يكسب صفه، والطرفان الساذجان يخسران.

**[2:02 — انزل إلى جداول R1 / R2 / R3]**
مع schema بأسماء مختلفة، وأسئلة عربية، ونموذج صغير مُبدَّل، وبلا أي إعادة ضبط، الدقة تثبت والـ controller يتكيف: يتحقق أكثر حين تكون الـ schema غريبة، ويكشف بطء النموذج البديل بدل أن يخفيه.

**[2:20 — جدول held-out]**
الأرقام النهائية من مجموعة محجوبة: مئة وخمسون مهمة وُلّدت بـ seed سري خارج المستودع، فيها ستة أنواع أسئلة لم تظهر أثناء التطوير، شُغّلت مرة واحدة بعد تجميد كل الإعدادات. ثمانية وستون بالمئة أقل تكلفة لكل إجابة صحيحة، بفارق دقة ستة أعشار نقطة.

**[2:41 — GitHub README، قسم Quick start]**
الحدود: بيانات صناعية، مجال واحد، موجّه معجمي، يومان وشخص واحد. وكل شيء قابل للتكرار بأمر واحد. شكراً.
