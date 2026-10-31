# Demo narration — read-aloud version (≤ 3 minutes)

Companion to `demo-script.md` (same beats, same timings). Pick one language. About 400 words; at a calm pace that is 3:00. Sentences in ⟨angle brackets⟩ are the first to drop if a take runs long. On-screen cues are in **bold**; do not read them.

---

## العربية

**[0:00 — الشريحة 1 من deck.pdf]**
الشركات ترسل كل سؤال إلى أكبر نموذج عندها، ومعه كامل الـ schema وكامل السجل. أغلب هذا الحساب يضيع. هذا المشروع controller واعٍ بالميزانية لتحليلات "اسأل بياناتك": لكل سؤال يقرر أي نموذج يستخدم، وأي جداول يرسل، ومتى يستحق الرأي الثاني ثمنه.

**[الشريحة 4]**
البيانات قاعدة شركة من اثني عشر جدولاً، والنماذج مستويان: صغير وكبير، بينهما نحو عشرين ضعفاً في السعر.

**[0:20 — PowerShell، نفّذ الأمر]**
سأمرّر ثمانية أسئلة، من السهل إلى الصعب، عبر النظام الكامل. راقبوا القرارات.
سؤال سعر منتج يذهب إلى النموذج الصغير بجدول واحد بدل اثني عشر، بثلاثة أجزاء من مئة من السنت. ⟨عدّ المدن يأخذ جدولين.⟩
الآن إجمالي إيرادات: هذا رقم مالي، فجواب النموذج الصغير يأخذ رأياً ثانياً من النموذج الكبير قبل أن يُعتمد، وهذا معنى ver=1.
السؤال العربي يسلك المسار نفسه تماماً، بلا أي معالجة خاصة.
السؤال الأخير، النمو السنوي حسب المنطقة، يسجّل درجة عالية عند الموجّه فيذهب مباشرة إلى النموذج الكبير مع الجداول الخمسة التي يحتاجها.
⟨لو فشل جواب رخيص في الفحوص المجانية أو رفضه المتحقق، يصعّد الـ controller مرة واحدة، والمحاولة الفاشلة تبقى في الفاتورة. في هذه المجموعة لم يحتج لذلك.⟩
كل سطر هنا صف JSON مسجّل بالتوكنات والتكلفة والزمن.

**[1:40 — المتصفح، report.html، مرّر على الصفوف P0 → S → P1 → P2 → P3 → V]**
نفس المئة والخمسين سؤالاً، ست سياسات. الأساس هو النموذج الكبير على كل شيء: دقة مئة بالمئة بأقل من سنت لكل إجابة صحيحة.
النموذج الصغير وحده رخيص لكنه يخسر الدقة في الأسئلة الصعبة.
إضافة الموجّه تخفض التكلفة لكل إجابة صحيحة ستة وأربعين بالمئة. إضافة تقليم السياق توصلها إلى ثمانية وستين بالمئة. التحقق الانتقائي يعيد الدقة إلى مئة بالمئة وهو يتحقق من سبعة بالمئة من الأسئلة فقط. والتحقق على كل شيء يعطي الدقة نفسها بأكثر من ضعف التكلفة.
إذن كل مكوّن يكسب صفه، والطرفان الساذجان يخسران.

**[انزل إلى جداول R1 / R2 / R3]**
مع schema بأسماء مختلفة، وأسئلة عربية، ونموذج صغير مُبدَّل، وبلا أي إعادة ضبط، الدقة تثبت والـ controller يتكيف: يتحقق أكثر حين تكون الـ schema غريبة، ويكشف بطء النموذج البديل بدل أن يخفيه.

**[2:30 — جدول held-out]**
الأرقام النهائية من مجموعة محجوبة: مئة وخمسون مهمة وُلّدت بـ seed سري خارج المستودع، فيها ستة أنواع أسئلة لم تظهر أثناء التطوير، شُغّلت مرة واحدة بعد تجميد كل الإعدادات. ثمانية وستون بالمئة أقل تكلفة لكل إجابة صحيحة، بفارق دقة ستة أعشار نقطة.

**[2:50 — GitHub README، قسم Quick start]**
الحدود: بيانات صناعية، مجال واحد، موجّه معجمي، يومان وشخص واحد. وكل شيء قابل للتكرار بأمر واحد. شكراً.

---

## English

**[0:00 — deck.pdf, slide 1]**
Companies send every question to their biggest model, with the whole schema and the whole history. Most of that compute is wasted. This is a budget-aware controller for ask-your-data analytics: per question it decides which model to use, which tables to send, and when a second opinion is worth paying for.

**[slide 4]**
The data is a twelve-table company database, and there are two model tiers, small and large, about twenty times apart in price.

**[0:20 — PowerShell, run the command]**
Let me run eight questions, easy to hard, through the full system. Watch the decisions.
A price lookup goes to the small model with one table instead of twelve, for three hundredths of a cent. ⟨A count over cities gets two tables.⟩
Now a revenue total: that is a money number, so the small model's answer gets a second opinion from the large model before it is trusted. That is the ver=1.
The Arabic question takes exactly the same path, with no special handling.
The last one, year-over-year growth by region, scores high on the router and goes straight to the large model with the five tables it needs.
⟨If a cheap answer ever fails its free checks or the verifier rejects it, the controller escalates once, and the failed attempt stays in the bill. On this set nothing needed it.⟩
Every line is a logged JSON row with tokens, cost and latency.

**[1:40 — browser, report.html, hover P0 → S → P1 → P2 → P3 → V]**
Same one hundred and fifty questions, six policies. The baseline is the large model on everything: one hundred percent accuracy at under a cent per correct answer.
Small model only is cheap but loses accuracy on the hard questions.
Adding the router cuts cost per correct answer by forty-six percent. Adding context pruning takes it to sixty-eight. Selective verification brings accuracy back to one hundred while verifying only seven percent of questions. Verify-always gets the same accuracy at more than twice the cost.
So each component earns its row, and both naive extremes lose.

**[scroll to R1 / R2 / R3]**
Under a renamed schema, Arabic questions and a swapped small model, with no retuning, accuracy holds and the controller adapts: it verifies more when the schema is unfamiliar, and it exposes the latency of the slower swapped model instead of hiding it.

**[2:30 — held-out table]**
The final numbers come from a held-out set: one hundred and fifty tasks generated with a secret seed outside the repository, including six question types never seen during development, run once after freezing every threshold. Sixty-eight percent less cost per correct answer, at zero point six points lower accuracy.

**[2:50 — GitHub README, Quick start]**
Limitations: synthetic data, one domain, a lexical router, two days, one person. Everything is reproducible from one command. Thank you.
