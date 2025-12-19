# Meshtastic CLI Viewer

## Releasing
1. Update version: `npm version <major|minor|patch> --no-git-tag-version`
2. Commit and tag: `git add package.json && git commit -m "vX.Y.Z" && git tag vX.Y.Z`
3. Push: `git push && git push origin vX.Y.Z`
4. Add release notes: `gh release edit vX.Y.Z --notes "..."` (summarize changes since last version)

## Code Style
- Keep code brief and concise
- Minimize comments - code should be self-explanatory
- Use official npm packages, not local references

## Design
- **Cypherpunk aesthetic**: Terminal hacker vibes, Matrix-style data streams
- Colors should be bold and varied - neon greens, cyans, magentas, oranges
- Each piece of information should have distinct coloring
- Packet type colors: message=green, position=cyan, telemetry=orange, nodeinfo=purple, routing=gray, encrypted=red
- Wireshark-inspired packet inspector with multiple views (normalized, protobuf tree, hex dump)
- Vim-style navigation (j/k, g/G, etc.)

## Testing
- Test node available at http://192.168.0.123 (live Meshtastic node)

## Ink (React for CLIs)

This project uses [Ink](https://github.com/vadimdemedes/ink) for the terminal UI.

### Key Patterns

**State management** - Use React hooks as normal:
```typescript
const [status, setStatus] = useState<DeviceStatus>("connecting");
const [packets, setPackets] = useState<DecodedPacket[]>([]);
```

**Keyboard input** - Use `useInput` hook:
```typescript
useInput((input, key) => {
  if (input === "q") exit();
  if (key.escape) setMode("packets");
  if (key.return) sendMessage();
  if (input === "j" || key.downArrow) selectNext();
});
```

**Terminal dimensions** - Use `useStdout` for resize handling:
```typescript
const { stdout } = useStdout();
const [height, setHeight] = useState(stdout?.rows || 24);

useEffect(() => {
  const updateSize = () => setHeight(stdout?.rows || 24);
  stdout?.on("resize", updateSize);
  return () => stdout?.off("resize", updateSize);
}, [stdout]);
```

### Gotchas

1. **Ctrl+number keys don't work** - Terminals don't send numbers when Ctrl is held. Use plain number keys (1, 2, 3) for tab switching instead of Ctrl+1, Ctrl+2, etc.

2. **Enum imports from protobufs** - Some enums are in separate modules:
   ```typescript
   // WRONG
   import { Mesh } from "@meshtastic/protobufs";
   Mesh.Channel_Role[channel.role]  // undefined!

   // RIGHT
   import { Channel } from "@meshtastic/protobufs";
   Channel.Channel_Role[channel.role]
   ```

3. **Async transport creation blocks UI** - Don't await transport before rendering:
   ```typescript
   // BAD - blank screen during connection
   const transport = await HttpTransport.create(address);
   render(<App transport={transport} />);

   // GOOD - show spinner immediately
   render(<App address={address} />);
   // Create transport in useEffect, show spinner while connecting
   ```

4. **Keys in lists** - Use unique keys that include index for items that might have duplicate IDs:
   ```typescript
   {packets.map((packet, i) => (
     <Row key={`${packet.id}-${i}`} ... />
   ))}
   ```

5. **Protobuf optional fields** - Use `== null` (double equals) to check for both null and undefined:
   ```typescript
   if (value == null) return "N/A";
   ```

### Scrolling Lists

Calculate visible window based on terminal height and keep selection centered:
```typescript
function ScrollList({ items, selectedIndex, height }) {
  const visibleCount = Math.max(1, height - 2);

  let startIndex = 0;
  if (items.length > visibleCount) {
    const halfView = Math.floor(visibleCount / 2);
    startIndex = Math.max(0, Math.min(
      selectedIndex - halfView,
      items.length - visibleCount
    ));
  }

  const visible = items.slice(startIndex, startIndex + visibleCount);
  return (
    <Box flexDirection="column">
      {visible.map((item, i) => (
        <Row
          key={item.id}
          isSelected={startIndex + i === selectedIndex}
        />
      ))}
    </Box>
  );
}
```
