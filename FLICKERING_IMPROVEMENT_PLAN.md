# Flickering Improvement Plan for Meshtastic CLI

## Problem Analysis

The CLI UI experiences flickering in several scenarios:
1. **Packet loading**: When new packets arrive, the entire UI re-renders
2. **Waiting-for-ACK indicator**: Animated dots update every 200ms, causing frequent re-renders
3. **LIVE indicator**: Pulsing animation updates every 800ms, causing re-renders
4. **State updates**: Many state changes in App.tsx trigger full component tree re-renders

## Root Causes

Based on code review and ink library research:

1. **No component memoization**: Components like `PacketList`, `ChatPanel`, `PacketRow`, `MessageRow` are not memoized, causing unnecessary re-renders
2. **Frequent state updates**: Animation timers (200ms, 800ms) trigger state updates that cascade through the entire tree
3. **Array recreation**: `setPackets((prev) => [...prev, packet])` creates new arrays on every packet, triggering re-renders
4. **No update batching**: Multiple rapid state updates cause multiple render cycles
5. **Large component tree**: App.tsx is a massive component (3500+ lines) with many state variables, causing expensive re-renders

## Improvement Strategy

### Phase 1: Component Memoization (High Impact, Low Risk)

**Goal**: Prevent unnecessary re-renders of child components when parent state changes but props haven't.

1. **Memoize PacketList component**
   - Wrap `PacketList` with `React.memo`
   - Add custom comparison function to only re-render when relevant props change
   - Memoize `PacketRow` component separately

2. **Memoize ChatPanel components**
   - Wrap `ChatPanel` with `React.memo`
   - Memoize `MessageRow` component
   - Memoize `AnimatedDots` component (isolate animation state)

3. **Memoize other panels**
   - `NodesPanel`, `DMPanel`, `ConfigPanel`, `LogPanel`, `MeshViewPanel`
   - Use shallow comparison for props

**Expected Impact**: 50-70% reduction in unnecessary re-renders

### Phase 2: Isolate Animation State (High Impact, Medium Risk)

**Goal**: Prevent animation state updates from triggering parent re-renders.

1. **Extract AnimatedDots to separate component**
   - Move `AnimatedDots` out of `MessageRow` 
   - Use `React.memo` to isolate it completely
   - Animation updates won't affect parent

2. **Extract LiveIndicator to separate component**
   - Already separate, but ensure it's memoized
   - Consider using a ref-based approach for frame updates if needed

3. **Use refs for non-visual state**
   - Move some frequently-updated state to refs (e.g., `meshViewConfirmedIdsRef` is already doing this)
   - Only update state when visual change is needed

**Expected Impact**: Eliminate flickering from animation updates

### Phase 3: Optimize Packet Updates (Medium Impact, Medium Risk)

**Goal**: Reduce re-renders when packets are added.

1. **Batch packet updates**
   - Instead of updating on every packet, batch updates (e.g., every 100ms or every 10 packets)
   - Use `requestAnimationFrame` or debouncing for packet list updates
   - Keep real-time updates for selected packet inspector

2. **Use useMemo for derived data**
   - Memoize filtered/sorted packet lists
   - Memoize visible packet ranges
   - Only recalculate when dependencies change

3. **Optimize packet array updates**
   - Consider using a ref to track packets and only update state periodically
   - Or use a more efficient data structure (e.g., linked list for append-only)

**Expected Impact**: 30-50% reduction in packet-related re-renders

### Phase 4: Split App Component (Low Impact, High Effort)

**Goal**: Reduce the scope of re-renders by splitting the monolithic App component.

1. **Extract mode-specific components**
   - Create `PacketsView`, `ChatView`, `NodesView`, etc.
   - Each manages its own state
   - App component only coordinates between views

2. **Use context for shared state**
   - Move shared state (transport, status, etc.) to React Context
   - Only components that need it will re-render

**Expected Impact**: 20-30% reduction, but requires significant refactoring

## Implementation Priority

### Priority 1: Quick Wins (Do First)
1. ✅ Memoize `AnimatedDots` component
2. ✅ Memoize `LiveIndicator` component  
3. ✅ Memoize `PacketRow` component
4. ✅ Memoize `MessageRow` component

### Priority 2: Medium Effort (Do Next)
1. ✅ Memoize `PacketList` with custom comparison
2. ✅ Memoize `ChatPanel` with custom comparison
3. ✅ Batch packet updates (debounce/throttle)
4. ✅ Use `useMemo` for filtered packet lists

### Priority 3: Larger Refactoring (Consider Later)
1. Split App component into smaller pieces
2. Use Context API for shared state
3. Implement virtual scrolling for large lists

## Specific Code Changes

### 1. Memoize AnimatedDots
```tsx
const AnimatedDots = React.memo(() => {
  const [frame, setFrame] = useState(0);
  // ... existing code
});
```

### 2. Memoize LiveIndicator  
```tsx
const LiveIndicator = React.memo(() => {
  const [frame, setFrame] = useState(0);
  // ... existing code
});
```

### 3. Memoize PacketRow
```tsx
const PacketRow = React.memo(({ packet, nodeStore, isSelected, useFahrenheit, meshViewConfirmedIds }: PacketRowProps) => {
  // ... existing code
}, (prevProps, nextProps) => {
  return prevProps.packet.id === nextProps.packet.id &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.useFahrenheit === nextProps.useFahrenheit &&
         prevProps.meshViewConfirmedIds === nextProps.meshViewConfirmedIds;
});
```

### 4. Memoize MessageRow
```tsx
const MessageRow = React.memo(({ message, nodeStore, isOwn, isSelected, width, meshViewConfirmedIds, allMessages }: MessageRowProps) => {
  // ... existing code
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.status === nextProps.message.status &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.width === nextProps.width;
});
```

### 5. Batch Packet Updates
```tsx
// In App.tsx
const packetUpdateQueueRef = useRef<DecodedPacket[]>([]);
const packetUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  const unsubscribe = packetStore.onPacket((packet) => {
    packetUpdateQueueRef.current.push(packet);
    
    if (!packetUpdateTimeoutRef.current) {
      packetUpdateTimeoutRef.current = setTimeout(() => {
        const batch = [...packetUpdateQueueRef.current];
        packetUpdateQueueRef.current = [];
        packetUpdateTimeoutRef.current = null;
        
        setPackets((prev) => {
          const next = [...prev, ...batch].slice(-5000);
          // ... auto-scroll logic
          return next;
        });
      }, 100); // Batch updates every 100ms
    }
  });
  return unsubscribe;
}, []);
```

### 6. Memoize PacketList
```tsx
export const PacketList = React.memo(({ packets, selectedIndex, nodeStore, height, isFollowing, useFahrenheit, meshViewConfirmedIds }: PacketListProps) => {
  // ... existing code
}, (prevProps, nextProps) => {
  return prevProps.packets.length === nextProps.packets.length &&
         prevProps.selectedIndex === nextProps.selectedIndex &&
         prevProps.height === nextProps.height &&
         prevProps.isFollowing === nextProps.isFollowing &&
         prevProps.useFahrenheit === nextProps.useFahrenheit;
});
```

## Testing Strategy

1. **Before/After comparison**
   - Measure render counts using React DevTools Profiler
   - Count re-renders of key components
   - Time packet update latency

2. **Visual testing**
   - Test with high packet rates (10+ packets/second)
   - Test with animated indicators active
   - Test mode switching

3. **Performance metrics**
   - Measure time to render
   - Check for dropped frames
   - Monitor memory usage

## Known Limitations

- Ink library itself may have limitations with very high update rates
- Terminal rendering is inherently slower than browser DOM
- Some flickering may be unavoidable with very rapid updates

## References

- Ink GitHub issues on flickering: https://github.com/vadimdemedes/ink/issues/359, https://github.com/vadimdemedes/ink/issues/450
- React.memo documentation: https://react.dev/reference/react/memo
- React performance optimization: https://react.dev/learn/render-and-commit
