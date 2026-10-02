import { Component, type ReactNode } from 'react';
import { log } from '../lib/log';

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    log.error('render', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert">
        <p>문제가 생겼어요. 다시 불러와 주세요</p>
        <button type="button" onClick={() => location.reload()}>
          새로고침
        </button>
      </div>
    );
  }
}
