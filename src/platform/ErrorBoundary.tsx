import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Solar render failure:', error, info.componentStack);
  }
  render() {
    if (this.state.error) return <section className="unsupported panel" role="alert">
      <h2>场景未能启动</h2><p>{this.state.error}</p><p>请确认 Chrome 硬件加速已开启。</p>
      <button className="primary-button" onClick={() => window.location.reload()}>重新加载</button>
    </section>;
    return this.props.children;
  }
}
