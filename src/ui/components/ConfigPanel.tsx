import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { FlatConfigRow } from "../config-fields";

function LoadingSpinner({ text = "Loading" }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text color={theme.fg.muted}>
      <Text color={theme.fg.accent}>{frames[frame]}</Text> {text}...
    </Text>
  );
}

interface ConfigPanelProps {
  rows: FlatConfigRow[];
  selectedIndex: number;
  height: number;
  loading?: boolean;
  editingField?: string | null;
  editValue?: string;
  batchEditCount?: number;
  filter?: string;
  filterInputActive?: boolean;
  loadedSections?: number;
  totalSections?: number;
}

export function ConfigPanel({
  rows,
  selectedIndex,
  height,
  loading,
  editingField,
  editValue,
  batchEditCount,
  filter,
  filterInputActive,
  loadedSections,
  totalSections,
}: ConfigPanelProps) {
  const contentHeight = Math.max(1, height - 4); // header + footer

  // Centered scroll window
  let startIndex = 0;
  if (rows.length > contentHeight) {
    const halfView = Math.floor(contentHeight / 2);
    startIndex = Math.max(0, Math.min(selectedIndex - halfView, rows.length - contentHeight));
  }
  const visible = rows.slice(startIndex, startIndex + contentHeight);

  return (
    <Box flexDirection="column" height={height} width="100%">
      {/* Header */}
      <Box paddingX={1}>
        <Text color={theme.fg.accent} bold>CONFIG</Text>
        {loading && (
          <Text color={theme.fg.muted}>
            {" "}<LoadingSpinner text={loadedSections !== undefined ? `loading ${loadedSections}/${totalSections}` : "loading"} />
          </Text>
        )}
        {(batchEditCount ?? 0) > 0 && (
          <Text color={theme.packet.encrypted}> [{batchEditCount} unsaved change{batchEditCount !== 1 ? "s" : ""}]</Text>
        )}
        {filter && (
          <Text color={theme.fg.muted}> filter: </Text>
        )}
        {filter && (
          <Text color={theme.fg.accent}>{filter}</Text>
        )}
        {filterInputActive && !filter && (
          <Text color={theme.fg.muted}> /</Text>
        )}
        {filterInputActive && (
          <Text color={theme.fg.accent}>█</Text>
        )}
      </Box>

      {/* Row list */}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {visible.map((row, i) => {
          const globalIndex = startIndex + i;
          const isSelected = globalIndex === selectedIndex;

          if (row.isSectionHeader) {
            return (
              <Box key={`hdr-${row.sectionHeader}-${i}`}>
                <Text color={theme.fg.muted}>── {row.sectionHeader} ──</Text>
              </Box>
            );
          }

          const field = row.field!;
          const isEditing = editingField === `${field.section}_${field.key}`;

          return (
            <Box
              key={`${field.section}_${field.key}-${i}`}
              backgroundColor={isSelected && !isEditing ? theme.bg.selected : undefined}
            >
              <Text color={isSelected ? theme.fg.accent : theme.fg.muted}>
                {isSelected ? "> " : "  "}
              </Text>
              <Text color={theme.fg.muted}>{field.label.padEnd(26)}</Text>
              {isEditing ? (
                <>
                  <Text color={theme.fg.accent}>{editValue}</Text>
                  <Text color={theme.fg.accent}>█</Text>
                  <Text color={theme.fg.muted}> (Enter=save, Esc=cancel)</Text>
                </>
              ) : (
                <>
                  <Text color={field.type === "readonly" ? theme.fg.muted : theme.fg.primary}>
                    {row.displayValue}
                  </Text>
                  {isSelected && field.type === "boolean" && (
                    <Text color={theme.fg.muted}> [Space] toggle</Text>
                  )}
                  {isSelected && field.type === "enum" && (
                    <Text color={theme.fg.muted}> [Space] cycle</Text>
                  )}
                  {isSelected && (field.type === "text" || field.type === "number") && (
                    <Text color={theme.fg.muted}> [Enter] edit</Text>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        {(batchEditCount ?? 0) > 0 ? (
          <Text color={theme.fg.muted}>j/k nav | Enter edit | / filter | c commit | C discard | r reboot</Text>
        ) : (
          <Text color={theme.fg.muted}>j/k nav | Enter edit | / filter | r reboot</Text>
        )}
      </Box>
    </Box>
  );
}
