import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { MobileTabBar, Sidebar } from "./components/Sidebar";
import { ScrollManager } from "./components/ScrollManager";
import { SiteFooter } from "./components/SiteFooter";
import { AlfondOverlay } from "./components/alfond/AlfondOverlay";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { rememberPage } from "./lib/recentPages";
import { PulseLine } from "./components/PulseLine";
import { UpdateNudge } from "./components/UpdateNudge";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useCardSpotlight } from "./hooks/useCardSpotlight";
import { AccountProvider } from "./context/AccountContext";
import { AuthGate } from "./components/AuthGate";
import { I18nProvider } from "./i18n/I18nProvider";
import { usePageMeta } from "./hooks/usePageMeta";

// Each page ships as its own chunk, fetched only when its route is visited, so the initial
// load doesn't pay for e.g. the ebook reader or quiz engine before the user ever opens them.
const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const FlashcardSubjects = lazy(() =>
  import("./pages/FlashcardSubjects").then((m) => ({ default: m.FlashcardSubjects })),
);
const FlashcardStudy = lazy(() =>
  import("./pages/FlashcardStudy").then((m) => ({ default: m.FlashcardStudy })),
);
const OcclusionSubjects = lazy(() =>
  import("./pages/OcclusionSubjects").then((m) => ({ default: m.OcclusionSubjects })),
);
const OcclusionStudy = lazy(() =>
  import("./pages/OcclusionStudy").then((m) => ({ default: m.OcclusionStudy })),
);
const SubjectsIndex = lazy(() => import("./pages/SubjectsIndex").then((m) => ({ default: m.SubjectsIndex })));
const SubjectHub = lazy(() => import("./pages/SubjectHub").then((m) => ({ default: m.SubjectHub })));
const QuizSubjects = lazy(() =>
  import("./pages/QuizSubjects").then((m) => ({ default: m.QuizSubjects })),
);
const QuizPlay = lazy(() => import("./pages/QuizPlay").then((m) => ({ default: m.QuizPlay })));
const ExamBlocks = lazy(() =>
  import("./pages/ExamBlocks").then((m) => ({ default: m.ExamBlocks })),
);
const ExamPlay = lazy(() => import("./pages/ExamPlay").then((m) => ({ default: m.ExamPlay })));
const ExamPackage = lazy(() => import("./pages/ExamPackage").then((m) => ({ default: m.ExamPackage })));
const ExamAttempt = lazy(() => import("./pages/ExamAttempt").then((m) => ({ default: m.ExamAttempt })));
const Admin = lazy(() => import("./pages/admin/Admin").then((m) => ({ default: m.Admin })));
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents").then((m) => ({ default: m.AdminStudents })));
const AdminPackages = lazy(() => import("./pages/admin/AdminPackages").then((m) => ({ default: m.AdminPackages })));
const AdminImport = lazy(() => import("./pages/admin/AdminImport").then((m) => ({ default: m.AdminImport })));
const AdminDrive = lazy(() => import("./pages/admin/AdminDrive").then((m) => ({ default: m.AdminDrive })));
const ExamResult = lazy(() => import("./pages/ExamResult").then((m) => ({ default: m.ExamResult })));
const Modules = lazy(() => import("./pages/Modules").then((m) => ({ default: m.Modules })));
const ClassDrive = lazy(() => import("./pages/ClassDrive").then((m) => ({ default: m.ClassDrive })));
const ModuleViewer = lazy(() =>
  import("./pages/ModuleViewer").then((m) => ({ default: m.ModuleViewer })),
);
const Summaries = lazy(() => import("./pages/Summaries").then((m) => ({ default: m.Summaries })));
const SummaryDetail = lazy(() =>
  import("./pages/SummaryDetail").then((m) => ({ default: m.SummaryDetail })),
);
const EbookSubjects = lazy(() =>
  import("./pages/EbookSubjects").then((m) => ({ default: m.EbookSubjects })),
);
const EbookReader = lazy(() =>
  import("./pages/EbookReader").then((m) => ({ default: m.EbookReader })),
);
const Search = lazy(() => import("./pages/Search").then((m) => ({ default: m.Search })));
const Progress = lazy(() => import("./pages/Progress").then((m) => ({ default: m.Progress })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));
const Leaderboard = lazy(() => import("./pages/Leaderboard").then((m) => ({ default: m.Leaderboard })));
const Lab = lazy(() => import("./pages/Lab").then((m) => ({ default: m.Lab })));
const Atlas = lazy(() => import("./pages/Atlas").then((m) => ({ default: m.Atlas })));
const LabActivityPage = lazy(() =>
  import("./pages/LabActivity").then((m) => ({ default: m.LabActivityPage })),
);
const Account = lazy(() => import("./pages/Account").then((m) => ({ default: m.Account })));
const KnowledgeMap = lazy(() => import("./pages/KnowledgeMap").then((m) => ({ default: m.KnowledgeMap })));
const ExamPlan = lazy(() => import("./pages/ExamPlan").then((m) => ({ default: m.ExamPlan })));
const Docs = lazy(() => import("./pages/Docs").then((m) => ({ default: m.Docs })));
const AlfondPage = lazy(() => import("./pages/Alfond").then((m) => ({ default: m.AlfondPage })));

/** Image occlusion briefly lived under the flashcards. */
function OldOcclusionRedirect() {
  const { blockId, subjectId } = useParams();
  return <Navigate to={`/occlusion/${blockId}/${subjectId}`} replace />;
}

function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-label="Loading page">
      <PulseLine />
    </div>
  );
}

// Keyed by pathname so a crash on one page resets the moment the user navigates away,
// instead of requiring a full reload to escape it.
function AppRoutes() {
  const { pathname } = useLocation();
  usePageMeta(pathname);
  // Remembered for the command palette's "recent".
  useEffect(() => { rememberPage(pathname); }, [pathname]);

  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/subjects" element={<SubjectsIndex />} />
          <Route path="/subjects/:blockId/:subjectId" element={<SubjectHub />} />
          <Route path="/flashcards" element={<FlashcardSubjects />} />
          <Route path="/flashcards/:blockId/:subjectId" element={<FlashcardStudy />} />
          <Route path="/flashcards/:blockId/:subjectId/occlusion" element={<OldOcclusionRedirect />} />
          <Route path="/occlusion" element={<OcclusionSubjects />} />
          <Route path="/occlusion/:blockId/:subjectId" element={<OcclusionStudy />} />
          <Route path="/quizzes" element={<QuizSubjects />} />
          <Route path="/quizzes/:blockId/:subjectId" element={<QuizPlay />} />
          <Route path="/exam" element={<ExamBlocks />} />
          <Route path="/exam/papers/:packageId" element={<ExamPackage />} />
          <Route path="/exam/attempt/:attemptId" element={<ExamAttempt />} />
          <Route path="/exam/result/:attemptId" element={<ExamResult />} />
          <Route path="/exam/:blockId" element={<ExamPlay />} />
          <Route path="/admin" element={<Admin />}>
            <Route index element={<Navigate to="/admin/students" replace />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="packages" element={<AdminPackages />} />
            <Route path="import" element={<AdminImport />} />
            <Route path="drive" element={<AdminDrive />} />
          </Route>
          <Route path="/modules" element={<Modules />} />
          <Route path="/modules/:blockId/:subjectId" element={<ModuleViewer />} />
          <Route path="/drive" element={<ClassDrive />} />
          <Route path="/summaries" element={<Summaries />} />
          <Route path="/summaries/:blockId/:subjectId" element={<SummaryDetail />} />
          <Route path="/ebooks" element={<EbookSubjects />} />
          <Route path="/ebooks/:blockId/:subjectId" element={<EbookReader />} />
          <Route path="/ebooks/:blockId/:subjectId/:chapterId" element={<EbookReader />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/lab/:exerciseId/:activitySlug" element={<LabActivityPage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/account" element={<Account />} />
          <Route path="/alfond" element={<AlfondPage />} />
          <Route path="/map" element={<KnowledgeMap />} />
          <Route path="/atlas" element={<Atlas />} />
          <Route path="/plan" element={<ExamPlan />} />
          <Route path="/plan/:blockId" element={<ExamPlan />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:pageId" element={<Docs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  useCardSpotlight();

  return (
    <ErrorBoundary>
      <I18nProvider>
      <AccountProvider>
        <AuthGate>
        <BrowserRouter>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <ScrollManager />
          <div className="app-shell">
            <Sidebar />
            <div className="app-content">
              <CommandPalette />
              <ShortcutsHelp />
              <UpdateNudge />
              <main className="main" id="main-content">
                <AppRoutes />
              </main>
              <SiteFooter />
            </div>
            <MobileTabBar />
            <AlfondOverlay />
          </div>
        </BrowserRouter>
        </AuthGate>
      </AccountProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
