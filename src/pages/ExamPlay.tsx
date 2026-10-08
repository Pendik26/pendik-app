import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { quizQuestionsInBlock } from "../lib/content";
import { blockById } from "../lib/blocks";
import { useExamHistory } from "../hooks/useExamHistory";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { buildSessionBank } from "../lib/quizShuffle";
import { buildExamFormat } from "../lib/examFormat";
import { ConfettiBurst } from "../components/ConfettiBurst";
import { SubjectBadge } from "../components/SubjectBadge";
import { FlagIcon, TimerIcon } from "../components/icons";
import { subjectHueStyle } from "../lib/subjectStyle";
import { STORAGE_KEYS } from "../lib/storage";
import type { Answers, ExamAttempt, QuizQuestion } from "../types/content";
import { NextUp } from "../components/plan/Today";

const OPTION_LETTERS = "ABCDEFGH";
const EMPTY_BANK: QuizQuestion[] = [];
/** Timer switches to its "running low" styling inside the last 2 minutes. */
const LOW_TIME_THRESHOLD_SEC = 120;

type ExamMode = "real" | "feedback";

function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function scoreMessage(score: number, total: number): string {
  const pct = total === 0 ? 0 : score / total;
  if (pct === 1) return "Perfect score.";
  if (pct >= 0.9) return "Excellent work.";
  if (pct >= 0.75) return "Great work.";
  return "Worth another pass — review the explanations below.";
}

export function ExamPlay() {
  const { blockId = "" } = useParams();
  const block = blockById(blockId);
  // The block's pooled exam, drawn from its quiz questions. Past papers have their own pages
  // (ExamPackage / ExamAttempt), run by the server.
  const pool = useMemo(() => (block ? quizQuestionsInBlock(block.id) : EMPTY_BANK), [block]);
  const format = useMemo(() => buildExamFormat(pool.length), [pool]);
  const historyKey = blockId;
  const { lastAttempt, recordAttempt } = useExamHistory(historyKey);
  const [mode, setMode] = useLocalStorage<ExamMode>(STORAGE_KEYS.examMode, "real");

  const [started, setStarted] = useState(false);
  const [examBank, setExamBank] = useState<QuizQuestion[]>(EMPTY_BANK);
  const [timeLimitSec, setTimeLimitSec] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<ExamAttempt | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const currentQuestion = examBank.at(currentIndex);
  const answeredCount = examBank.filter((q) => answers[q.id] !== undefined).length;
  const isLast = currentIndex === examBank.length - 1;

  const startCustomBank = (bank: QuizQuestion[], limitSec: number) => {
    setExamBank(bank);
    setTimeLimitSec(limitSec);
    setSecondsLeft(limitSec);
    setCurrentIndex(0);
    setAnswers({});
    setFlagged(new Set());
    setFinished(false);
    setResult(null);
    setReviewOpen(false);
    setStarted(true);
  };

  const startExam = () => {
    const bank = buildSessionBank(pool).slice(0, format.questionCount);
    startCustomBank(bank, format.timeLimitSec);
  };

  const finishExam = () => {
    if (finished) return;
    const timeTakenSec = timeLimitSec - secondsLeft;
    const attempt = recordAttempt(examBank, answers, timeTakenSec, timeLimitSec);
    setResult(attempt);
    setFinished(true);
  };

  // Always-latest ref so the interval below can call the current finishExam closure
  // (which closes over live answers/secondsLeft) without re-creating the interval every tick.
  const finishExamRef = useRef(finishExam);
  useEffect(() => {
    finishExamRef.current = finishExam;
  });

  useEffect(() => {
    if (!started || finished) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          window.setTimeout(() => { finishExamRef.current(); }, 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { window.clearInterval(id); };
  }, [started, finished]);

  const selectAnswer = (optionIndex: number) => {
    if (!currentQuestion) return;
    if (mode === "feedback" && answers[currentQuestion.id] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }));
  };

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= examBank.length) return;
    setCurrentIndex(index);
  };

  const goPrev = () => { goToQuestion(currentIndex - 1); };
  const goNext = () => { goToQuestion(currentIndex + 1); };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
      else next.add(currentQuestion.id);
      return next;
    });
  };

  const confirmSubmit = () => {
    const unanswered = examBank.length - answeredCount;
    if (unanswered > 0 || flagged.size > 0) {
      const parts: string[] = [];
      if (unanswered > 0) parts.push(`${unanswered} unanswered`);
      if (flagged.size > 0) parts.push(`${flagged.size} flagged for review`);
      if (!window.confirm(`You have ${parts.join(" and ")}. Submit the exam anyway?`)) return;
    }
    finishExam();
  };

  useEffect(() => {
    if (!started || finished || !currentQuestion) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      const letterIdx = OPTION_LETTERS.indexOf(e.key.toUpperCase());
      const digitIdx = "123456789".indexOf(e.key);
      const idx = letterIdx >= 0 ? letterIdx : digitIdx;
      if (idx >= 0 && idx < currentQuestion.options.length) {
        e.preventDefault();
        selectAnswer(idx);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, currentQuestion, currentIndex]);

  const navScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!started || finished) return;
    const el = navScrollRef.current?.querySelector<HTMLElement>(".quiz-nav-pill.current");
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [currentIndex, started, finished]);

  const missedQuestions = result ? examBank.filter((q) => result.missedIds.includes(q.id)) : [];

  if (!block) {
    return (
      <section className="page">
        <p>Unknown block.</p>
        <Link to="/exam">Back to exam</Link>
      </section>
    );
  }

  if (format.questionCount === 0) {
    return (
      <section className="page subject-tinted" style={subjectHueStyle(blockId) as CSSProperties}>
        <Link to="/exam" className="back-link">
          ← All exams
        </Link>
        <div className="quiz-start">
          <div className="quiz-start-badge">
            <SubjectBadge id={block.id} label={block.label} />
          </div>
          <h1>{block.label}</h1>
          <p className="subtitle">No questions available for this block yet — check back once its subjects have content.</p>
        </div>
      </section>
    );
  }

  if (!started) {
    return (
      <section className="page subject-tinted" style={subjectHueStyle(blockId) as CSSProperties}>
        <Link to="/exam" className="back-link">
          ← All exams
        </Link>
        <div className="quiz-start">
          <div className="quiz-start-badge">
            <SubjectBadge id={block.id} label={block.label} />
          </div>
          <h1>{block.label}</h1>
          <p className="subtitle">
            {mode === "real"
              ? "Timed block exam — answers aren't revealed until you submit."
              : "Timed block exam — see if you're right after each question."}
          </p>
          <p className="exam-format-note">
            {format.questionCount} questions · {Math.round(format.timeLimitSec / 60)} minutes ·{" "}
            pooled from every subject in this block
          </p>

          {lastAttempt && (
            <p className="exam-last-score">
              Last attempt: <strong>{lastAttempt.score}/{lastAttempt.total}</strong> in{" "}
              {formatClock(lastAttempt.timeTakenSec)}
            </p>
          )}

          <div className="exam-mode-toggle" role="radiogroup" aria-label="Exam mode">
            <button
              type="button"
              className={mode === "real" ? "exam-mode-btn active" : "exam-mode-btn"}
              onClick={() => { setMode("real"); }}
              role="radio"
              aria-checked={mode === "real"}
            >
              <span className="exam-mode-name">Real exam mode</span>
              <span className="exam-mode-desc">No feedback until you submit — like the real thing.</span>
            </button>
            <button
              type="button"
              className={mode === "feedback" ? "exam-mode-btn active" : "exam-mode-btn"}
              onClick={() => { setMode("feedback"); }}
              role="radio"
              aria-checked={mode === "feedback"}
            >
              <span className="exam-mode-name">Instant feedback mode</span>
              <span className="exam-mode-desc">See the correct answer and explanation after each question.</span>
            </button>
          </div>

          <div className="quiz-start-actions">
            <button className="btn quiz-start-btn" onClick={startExam}>
              Start exam
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page subject-tinted" style={subjectHueStyle(blockId) as CSSProperties}>
      <Link to="/exam" className="back-link">
        ← All exams
      </Link>
      <div className="quiz-header">
        <div>
          <h1>{block.label}</h1>
          {!finished && (
            <p className="subtitle">
              {examBank.length}-question block exam
              {mode === "feedback" ? " · instant feedback mode" : " · real exam mode"}
            </p>
          )}
        </div>
        {!finished && (
          <div className={secondsLeft <= LOW_TIME_THRESHOLD_SEC ? "exam-timer exam-timer-low" : "exam-timer"} role="timer">
            <TimerIcon />
            {formatClock(secondsLeft)}
          </div>
        )}
      </div>

      {!finished && !currentQuestion ? (
        <p className="subtitle">There are no questions in this session.</p>
      ) : !finished && currentQuestion ? (
        <div className="quiz-card">
          <div className="quiz-progress">
            <div className="quiz-progress-track">
              <div className="quiz-progress-fill" style={{ width: `${(answeredCount / examBank.length) * 100}%` }} />
            </div>
            <span className="quiz-progress-label">
              Question {currentIndex + 1} of {examBank.length}
            </span>
          </div>

          <div className="quiz-nav-strip" ref={navScrollRef}>
            {examBank.map((q, qi) => {
              const ans = answers[q.id];
              let cls = "quiz-nav-pill";
              if (qi === currentIndex) cls += " current";
              if (ans !== undefined) {
                cls += mode === "feedback" ? (ans === q.answer ? " correct" : " incorrect") : " answered";
              }
              if (flagged.has(q.id)) cls += " flagged";
              return (
                <button
                  key={q.id}
                  type="button"
                  className={cls}
                  onClick={() => { goToQuestion(qi); }}
                  aria-current={qi === currentIndex ? "true" : undefined}
                  aria-label={`Go to question ${qi + 1}${flagged.has(q.id) ? " (flagged)" : ""}`}
                  title={`Question ${qi + 1}`}
                >
                  {qi + 1}
                </button>
              );
            })}
          </div>

          <div className="quiz-question-head">
            <p className="quiz-question-text">{currentQuestion.question}</p>
            <button
              type="button"
              className={flagged.has(currentQuestion.id) ? "exam-flag-btn active" : "exam-flag-btn"}
              onClick={toggleFlag}
              aria-pressed={flagged.has(currentQuestion.id)}
            >
              <FlagIcon />
              {flagged.has(currentQuestion.id) ? "Flagged" : "Flag for review"}
            </button>
          </div>

          {currentQuestion.image && (
            <div className="quiz-question-image" dangerouslySetInnerHTML={{ __html: currentQuestion.image }} />
          )}

          {(() => {
            const selected = answers[currentQuestion.id];
            const revealed = mode === "feedback" && selected !== undefined;
            return (
              <>
                <div className="quiz-options" role="radiogroup" aria-label={currentQuestion.question}>
                  {currentQuestion.options.map((opt, oi) => {
                    let cls = "quiz-option";
                    if (revealed) {
                      if (oi === currentQuestion.answer) cls += " correct";
                      else if (oi === selected) cls += " incorrect";
                    } else if (selected === oi) {
                      cls += " selected";
                    }
                    return (
                      <button
                        key={oi}
                        className={cls}
                        onClick={() => { selectAnswer(oi); }}
                        disabled={revealed}
                        role="radio"
                        aria-checked={selected === oi}
                      >
                        <span className="quiz-option-letter">{OPTION_LETTERS.charAt(oi)}</span>
                        <span className="quiz-option-text">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="quiz-keyboard-hint">
                  {revealed ? "Tip: ← → to move between questions" : "Tip: press a letter to answer · ← → to move between questions"}
                </p>

                {revealed && (
                  <div
                    className={`quiz-feedback ${selected === currentQuestion.answer ? "correct" : "incorrect"}`}
                    role="status"
                  >
                    <p className="quiz-feedback-verdict">
                      {selected === currentQuestion.answer ? "Correct" : "Not quite"}
                    </p>
                    <p className="quiz-feedback-explanation">{currentQuestion.explanation}</p>
                  </div>
                )}
              </>
            );
          })()}

          <div className="quiz-nav-buttons">
            <button type="button" className="btn btn-secondary quiz-prev-btn" onClick={goPrev} disabled={currentIndex === 0}>
              ← Previous
            </button>
            {isLast ? (
              <button type="button" className="btn quiz-next-btn" onClick={confirmSubmit}>
                Submit exam
              </button>
            ) : (
              <button type="button" className="btn btn-secondary quiz-skip-btn" onClick={goNext}>
                Next →
              </button>
            )}
          </div>

          {!isLast && (
            <button type="button" className="exam-submit-early" onClick={confirmSubmit}>
              Submit exam now ({answeredCount}/{examBank.length} answered)
            </button>
          )}
        </div>
      ) : (
        result && (
          <div className="quiz-results">
            <div className={`quiz-score-hero${result.score === result.total ? " perfect" : ""}`}>
              {result.score === result.total && <ConfettiBurst />}
              <p className="quiz-score-value">
                {result.score}
                <span className="quiz-score-total">/{result.total}</span>
              </p>
              <p className="quiz-score-caption">{scoreMessage(result.score, result.total)}</p>
              <p className="exam-time-caption">
                Completed in {formatClock(result.timeTakenSec)} of {formatClock(result.timeLimitSec)}
              </p>
            </div>

            <div className="quiz-retry-row">
              {missedQuestions.length > 0 && (
                <button
                  className="btn"
                  onClick={() => { startCustomBank(buildSessionBank(missedQuestions), missedQuestions.length * 60); }}
                >
                  Retake missed only ({missedQuestions.length})
                </button>
              )}
              <Link to="/exam" className="btn btn-secondary">
                Choose another block
              </Link>
            </div>

            <NextUp />

            <button
              className="btn btn-secondary quiz-review-toggle"
              onClick={() => { setReviewOpen((v) => !v); }}
              aria-expanded={reviewOpen}
            >
              {reviewOpen ? "Hide full review ▲" : "Show full review ▼"}
            </button>

            {reviewOpen && (
              <ol className="quiz-review-list">
                {examBank.map((q, qi) => {
                  const chosen = answers[q.id];
                  const wasCorrect = chosen === q.answer;
                  return (
                    <li key={q.id} className="quiz-review-item">
                      <p className="quiz-question-text">
                        {qi + 1}. {q.question}
                      </p>
                      {q.image && (
                        <div className="quiz-question-image quiz-question-image-small" dangerouslySetInnerHTML={{ __html: q.image }} />
                      )}
                      <div className="quiz-options quiz-options-static">
                        {q.options.map((opt, oi) => {
                          let cls = "quiz-option";
                          if (oi === q.answer) cls += " correct";
                          else if (oi === chosen) cls += " incorrect";
                          return (
                            <div key={oi} className={cls}>
                              <span className="quiz-option-letter">{OPTION_LETTERS.charAt(oi)}</span>
                              <span className="quiz-option-text">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className={`quiz-feedback-explanation quiz-review-explanation ${wasCorrect ? "correct" : "incorrect"}`}>
                        {wasCorrect ? "Correct. " : chosen === undefined ? "Not answered. " : "Missed. "}
                        {q.explanation}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )
      )}
    </section>
  );
}
