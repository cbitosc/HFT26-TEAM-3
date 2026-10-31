import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '../ui-kit';
import { START_ROUTE } from './config';
import { Label, Reveal } from './primitives';

export default function FinalCTA() {
  return (
    <section className="tl-section tl-final" aria-labelledby="tl-cta-h">
      <div className="tl-grid tl-final-grid" aria-hidden />
      <Reveal className="tl-wrap tl-final-in">
        <Label>BEGIN</Label>
        <h2 id="tl-cta-h">Every second matters.<br /><span>Every piece of evidence matters.</span></h2>
        <Button as={Link} to={START_ROUTE} variant="primary" size="lg" rightIcon={ArrowUpRight}>Start an investigation</Button>
      </Reveal>
    </section>
  );
}
