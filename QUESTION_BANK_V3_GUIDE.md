# ZamBright Academy V3 — Learn, Practice, Improve

This is **part of the existing website** (`index.html?view=practice`), not a separate website.

## Pupil experience
1. Click **Practice Questions** in the homepage menu or **Start Practicing** in the hero.
2. Filter by subject, grade/form, topic and difficulty; click **Start practice**.
3. For multiple-choice questions, select an answer and click **Check answer**. The website marks that answer immediately, showing the correct model answer and explanation.
4. For written/scenario questions, type your answer, click **Show model answer**, compare the explanation, then honestly select **I got it right** or **I need more practice**.
5. At the end, a session result appears. A limited record of attempts and correct answers (question IDs only) is stored in the current browser, not on a pupil account.
6. Print an approved set of up to ten filtered questions with optional answer key. **Demo questions** are examples and are not official ECZ papers.

## Owner experience
1. Sign in at `admin.html`.
2. Open **Question Bank**.
3. Review the five initial **private draft** original Form 1 Physics questions in Stability, Measurement of Mass and Laboratory Safety.
4. Correct and verify against the applicable actual Zambian syllabus and the science/mathematics involved. The `competency` field contains a teaching objective, not a claim of exact officially issued CBC syllabus wording.
5. When satisfied, check **I have checked...**, choose **Published**, save, and confirm.
6. The verified question appears automatically in public Practice Questions. Users never see private drafts.
7. Add further original questions with detailed worked solutions and explanations. Use the **Duplicate as draft** button to build a bank faster.

## Privacy and security
- Supabase table: `public.zambright_questions`.
- RLS public SELECT only for `status='published' AND verified=true`.
- Insert, update and delete are restricted to the existing authenticated `is_zambright_admin()` owner check.
- A database constraint prevents publication unless `verified=true`, independent of browser forms.
- No public sign-in is required. No pupil names, written answers or personal details are stored in the database by this first release.
- The five seed questions remain **draft**, so the approved question bank initially displays zero public questions; use **Try 2 sample questions** for the demo.

## Limitations and next steps
- This release is the **first** pilot question-bank and worksheet foundation, not a completed 100-question syllabus-aligned library.
- Automatic marking applies to multiple-choice questions. Written/scenario questions are **self-assessed** against a complete model solution; the website does not claim to grade arbitrary written answers.
- Only the owner should publish after curriculum and answer verification. Do not label original practice questions as ECZ examination papers.
- A real teacher review of the seeded questions is needed before publication.
- Future releases can add syllabus-approved competency taxonomy, larger reviewed question collections, verified teacher accounts, class assignments, and stronger offline use after testing demand.
