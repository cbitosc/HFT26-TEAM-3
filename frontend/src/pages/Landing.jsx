import { lazy, useEffect } from 'react';
import '../landing/landing.css';
import { DemoVideoProvider } from '../landing/VideoContext';
import Defer from '../landing/Defer';
import LandingNavbar from '../landing/LandingNavbar';
import HeroSection from '../landing/HeroSection';
import DemoVideoSection from '../landing/DemoVideoSection';
import ProblemSection from '../landing/ProblemSection';
import HowItWorksSection from '../landing/HowItWorksSection';
import LandingFooter from '../landing/LandingFooter';

const ReconstructionTimelineSection = lazy(() => import('../landing/ReconstructionTimelineSection'));
const EvidenceCorrelationSection = lazy(() => import('../landing/EvidenceCorrelationSection'));
const ContradictionsSection = lazy(() => import('../landing/ContradictionsSection'));
const InvestigationReportSection = lazy(() => import('../landing/InvestigationReportSection'));
const FinalCTA = lazy(() => import('../landing/FinalCTA'));

export default function Landing() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'TraceLine · Reconstruct what really happened';
    return () => { document.title = prev; };
  }, []);
  return (
    <div className="tl-land">
      <DemoVideoProvider>
        <a href="#product" className="tl-skip">Skip to content</a>
        <LandingNavbar />
        <main>
          <HeroSection />
          <ProblemSection />
          <HowItWorksSection />
          <DemoVideoSection />
          <Defer id="timeline" minHeight={1900}><ReconstructionTimelineSection /></Defer>
          <Defer id="correlation" minHeight={1050}><EvidenceCorrelationSection /></Defer>
          <Defer id="contradictions" minHeight={1750}><ContradictionsSection /></Defer>
          <Defer id="report" minHeight={1290}><InvestigationReportSection /></Defer>
          <Defer id="cta" minHeight={440}><FinalCTA /></Defer>
        </main>
        <LandingFooter />
      </DemoVideoProvider>
    </div>
  );
}
