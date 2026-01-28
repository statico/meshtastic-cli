import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

interface DeviceNotificationModalProps {
  message: string;
  level?: number;
  remaining: number;
}

export function DeviceNotificationModal({ message, level, remaining }: DeviceNotificationModalProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Level colors: 40+ = error (red), 30+ = warning (yellow), else info (cyan)
  const levelColor = level !== undefined && level >= 40 ? theme.status.offline
    : level !== undefined && level >= 30 ? "#ffcc00"
    : theme.fg.accent;

  const levelName = level !== undefined && level >= 40 ? "ERROR"
    : level !== undefined && level >= 30 ? "WARNING"
    : "INFO";

  const dots = ".".repeat((frame % 3) + 1).padEnd(3);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={levelColor}
      backgroundColor={theme.bg.primary}
      paddingX={3}
      paddingY={1}
      alignItems="center"
    >
      <Box marginBottom={1}>
        <Text bold color={levelColor}>
          ═══ DEVICE {levelName} ═══
        </Text>
      </Box>

      <Box>
        <Text color={theme.fg.primary}>{message}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.fg.muted}>Auto-dismiss in {remaining}s  (Esc/Space to close)</Text>
      </Box>
    </Box>
  );
}
