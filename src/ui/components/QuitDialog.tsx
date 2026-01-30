import React from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme";
import { Logger } from "../../logger";

interface QuitDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function QuitDialog({ onConfirm, onCancel }: QuitDialogProps) {
  useInput((input, key) => {
    if (key.return || input === "y" || input === "Y") {
      Logger.info("QuitDialog", "User confirmed quit", { key: key.return ? "return" : input });
      onConfirm();
    } else if (key.escape || input === "n" || input === "N") {
      Logger.info("QuitDialog", "User cancelled quit", { key: key.escape ? "escape" : input });
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.packet.encrypted}
      backgroundColor={theme.bg.primary}
      paddingX={3}
      paddingY={1}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={theme.packet.encrypted}>QUIT?</Text>
      </Box>
      <Box justifyContent="center" marginBottom={1}>
        <Text color={theme.fg.primary}>Are you sure you want to exit?</Text>
      </Box>
      <Box justifyContent="center" gap={2}>
        <Text color={theme.data.snr}>[Enter/Y] Yes</Text>
        <Text color={theme.fg.muted}>  </Text>
        <Text color={theme.data.nodeTo}>[Esc/N] No</Text>
      </Box>
    </Box>
  );
}
