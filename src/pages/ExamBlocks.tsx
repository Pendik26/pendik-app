import { Link } from "react-router-dom";
import { examPackagesByBlock, quizQuestionsInBlock } from "../lib/content";
import { studyBlocks, upcomingSubjects } from "../lib/blocks";
import { buildExamFormat } from "../lib/examFormat";
import { readJSON, STORAGE_KEYS } from "../lib/storage";
import { SubjectBadge } from "../components/SubjectBadge";
import type { ExamAttempt } from "../types/content";

export function ExamBlocks() {
  return (
    <section className="page">
      <h1>Exam</h1>
      <p className="subtitle">
        A timed, block-style practice exam pooling questions across everything in a study block —
        no instant feedback, scored at the end.
      </p>
      <div className="card-grid">
        {studyBlocks.map((block) => {
          const packages = examPackagesByBlock.get(block.id) ?? [];
          const pooledSize = quizQuestionsInBlock(block.id).length;
          const poolSize = packages.length > 0 ? Math.max(...packages.map((p) => p.questionCount)) : pooledSize;
          const format = buildExamFormat(poolSize);
          const stillUpcoming = upcomingSubjects.some((u) => u.blockId === block.id) && poolSize === 0;

          if (format.questionCount === 0) {
            return (
              <div key={block.id} className="nav-card nav-card-upcoming">
                <div className="nav-card-header">
                  <SubjectBadge id={block.id} label={block.label} />
                  <h2>{block.label}</h2>
                </div>
                <p>{stillUpcoming ? "Content coming soon." : "No questions yet for this block."}</p>
              </div>
            );
          }

          if (packages.length > 1) {
            return (
              <Link key={block.id} to={`/exam/${block.id}`} className="nav-card">
                <div className="nav-card-header">
                  <SubjectBadge id={block.id} label={block.label} />
                  <h2>{block.label}</h2>
                </div>
                <p>{packages.length} exam packages to choose from</p>
              </Link>
            );
          }

          const history = readJSON<ExamAttempt[]>(STORAGE_KEYS.examHistory(block.id), []);
          const last = history.at(-1);

          return (
            <Link key={block.id} to={`/exam/${block.id}`} className="nav-card">
              <div className="nav-card-header">
                <SubjectBadge id={block.id} label={block.label} />
                <h2>{block.label}</h2>
              </div>
              <p>
                {format.questionCount} questions · {Math.round(format.timeLimitSec / 60)} min
                {last && (
                  <>
                    {" "}
                    · last score <strong>{last.score}/{last.total}</strong>
                  </>
                )}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
