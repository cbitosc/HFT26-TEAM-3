import { Link } from 'react-router-dom';
import { Brand } from '../ui-kit';
import { DEMO_VIDEO, MULTI_SOURCE, NAV_ITEMS, START_ROUTE } from './config';
import { scrollToId } from './LandingNavbar';

export default function LandingFooter() {
  return (
    <footer id="about" className="tl-footer">
      <div className="tl-wrap tl-footer-grid">
        <div>
          <Brand name="TraceLine" to="/" />
          <p>Evidence-led accident reconstruction. TraceLine organises recordings, statements and sensor data into a traceable timeline for investigators. It supports review and never decides fault.</p>
        </div>
        <nav aria-label="Footer">
          {NAV_ITEMS.map((n) => <a key={n.id} href={`#${n.id}`} onClick={(e) => { e.preventDefault(); scrollToId(n.id, false); }}>{n.label}</a>)}
          <Link to={START_ROUTE}>Start investigation</Link>
          <Link to="/cases">Investigations</Link>
        </nav>
      </div>
      <div className="tl-wrap tl-footer-legal">
        <span>All timeline events, statements and findings on this page are illustrative examples.</span>
        <span>Demo footage: {MULTI_SOURCE.attribution} · {DEMO_VIDEO.attribution}</span>
      </div>
    </footer>
  );
}
