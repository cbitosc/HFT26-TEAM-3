import { Component } from 'react';

/** A failed screen must leave a recovery action instead of an empty application. */
export default class RouteErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error('TraceLine screen failed', error, info); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="mx-auto max-w-prose p-8" role="alert">
      <h1 className="t-h1">This screen could not be displayed</h1>
      <p className="mt-4 text-fg-2">Your uploaded evidence is still stored. Reload this screen or return to the case list.</p>
      <div className="mt-6 flex gap-4"><button className="btn rounded-md border border-line px-4 py-2" onClick={() => location.reload()}>Reload screen</button><a className="btn rounded-md border border-line px-4 py-2" href="/cases">Return to cases</a></div>
    </main>;
  }
}
