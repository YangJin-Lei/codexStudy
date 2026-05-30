import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { WorkbenchPanelErrorFallback } from "./WorkbenchPanelErrorFallback";

type WorkbenchPanelErrorBoundaryProps = {
  panelLabel: string;
  children: ReactNode;
};

type WorkbenchPanelErrorBoundaryState = {
  error: Error | null;
  retryKey: number;
};

export class WorkbenchPanelErrorBoundary extends Component<
  WorkbenchPanelErrorBoundaryProps,
  WorkbenchPanelErrorBoundaryState
> {
  state: WorkbenchPanelErrorBoundaryState = {
    error: null,
    retryKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<WorkbenchPanelErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Workbench panel "${this.props.panelLabel}" crashed`, { error, info });
  }

  private handleRetry = () => {
    this.setState((current) => ({
      error: null,
      retryKey: current.retryKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="workbench-panel-error-shell">
          <WorkbenchPanelErrorFallback
            panelLabel={this.props.panelLabel}
            errorMessage={this.state.error.message}
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
