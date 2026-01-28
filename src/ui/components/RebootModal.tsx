import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface RebootModalProps {
  reason?: string;
  elapsed: number;
  timeout?: number;
}

export function RebootModal({ reason, elapsed, timeout = 60 }: RebootModalProps) {
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(0, timeout - elapsed);
  const timedOut = elapsed >= timeout;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={timedOut ? theme.status.offline : theme.fg.accent}
      backgroundColor={theme.bg.primary}
      paddingX={3}
      paddingY={1}
      alignItems="center"
    >
      <Box marginBottom={1}>
        <Text bold color={timedOut ? theme.status.offline : theme.fg.accent}>
          {timedOut ? "═══ CONNECTION TIMEOUT ═══" : "═══ DEVICE REBOOTING ═══"}
        </Text>
      </Box>

      {!timedOut && (
        <>
          <Box>
            <Text color={theme.fg.accent}>{SPINNER_FRAMES[spinnerFrame]}</Text>
            <Text color={theme.fg.primary}> Waiting for device to reconnect...</Text>
          </Box>
          {reason && (
            <Box marginTop={1}>
              <Text color={theme.fg.muted}>Reason: {reason}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={theme.fg.secondary}>Timeout in {remaining}s</Text>
          </Box>
        </>
      )}

      {timedOut && (
        <>
          <Box>
            <Text color={theme.fg.primary}>Device did not reconnect within {timeout}s</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.fg.muted}>Press any key to dismiss</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
