import RouteErrorBoundary from './components/RouteErrorBoundary';
import { Navigate, Route, Routes, useParams, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import EvidencePage from './pages/EvidencePage';
import Workspace from './pages/Workspace';
import NewCase from './pages/NewCase';
import ReportPage from './pages/Report';
import CaseScoped from './components/CaseScoped';

const To = ({ section }) => {
  const { caseId } = useParams();
  return <Navigate replace to={`/${section}/${caseId}`} />;
};

const scoped = (section, element) => (
  <>
    <Route path={`/${section}`} element={<CaseScoped section={section}>{element}</CaseScoped>} />
    <Route path={`/${section}/:caseId`} element={<CaseScoped section={section}>{element}</CaseScoped>} />
  </>
);

export default function App() {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary key={pathname}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/cases" element={<Cases />} />
      <Route path="/new" element={<NewCase />} />
      {scoped('evidence', <EvidencePage />)}
      {scoped('reconstruction', <Workspace />)}
      {scoped('reports', <ReportPage />)}
      <Route path="/cases/:caseId" element={<To section="reconstruction" />} />
      <Route path="/cases/:caseId/report" element={<To section="reports" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </RouteErrorBoundary>
  );
}
