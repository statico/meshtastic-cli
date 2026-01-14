import React, { Component, ReactNode } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { Logger } from "../../logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component to catch React errors and prevent total UI crash
 * Shows a simple error message instead of crashing the entire application
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Logger.error(
      "ErrorBoundary",
      `Error in ${this.props.context || "component"}`,
      error,
      {
        componentStack: errorInfo.componentStack,
      }
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box flexDirection="column" padding={1}>
          <Text color={theme.status.error} bold>
            Error in {this.props.context || "component"}
          </Text>
          <Text color={theme.fg.muted}>
            {this.state.error?.message || "Unknown error"}
          </Text>
          <Text color={theme.fg.muted}>
            Press 'q' to quit or navigate away to continue
          </Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
