# Meshtastic CLI Viewer

## Code Style
- Keep code brief and concise
- Minimize comments - code should be self-explanatory
- Use official npm packages, not local references

## Testing
- Test node available at http://192.168.0.123 (live Meshtastic node)

## OpenTUI Gotchas

### Terminal escape sequences leak on crash
When the app shows raw escape sequences like `1016;2$y2027;1$y...` instead of the TUI, it means the app crashed during renderer initialization. The renderer sends terminal capability queries, and if the app crashes before it can consume the responses, they get printed as garbage.

### Debugging approach
Create incremental test files to isolate the failure:
1. Test renderer only
2. Test with ScrollBoxRenderable
3. Test database imports
4. Test stores
5. Test each UI component individually

Run each test in sequence until one fails, then you've found the culprit.

### DO NOT in OpenTUI

1. **Never use `.join()` on StyledText arrays** - The `t` template literal returns StyledText objects, not strings. Calling `.join()` converts them to `[object Object]`. Instead, build multi-line content with template literals containing newlines.

2. **Never concatenate StyledText by interpolating into a new template** - Doing `result = t\`${result}\n${more}\`` converts the existing StyledText to `[object Object]`. Build all content in a single template, or use separate return statements for each case.

3. **Never call methods that don't exist** - OpenTUI swallows errors. Check method signatures:
   - `scrollBy(delta)` - NOT `scrollBy(x, y)`
   - `scrollTo(position)` - NOT `scrollTo(x, y)`
   - Use `getChildren()` + `remove(id)` - NOT `.clear()`

4. **Never render during constructor** - If a component subscribes to events that fire immediately (like `nodeStore.onUpdate()`), defer with `setTimeout(() => {...}, 0)` to let the component attach to the render tree first.

5. **Never access UI elements before they're created** - Ensure initialization order is correct. Create status bars/text elements before calling functions that update them.

6. **Always use `== null` for protobuf optional fields** - Protobuf values can be `null`, not just `undefined`. Use `value == null` (double equals) to catch both, or `value != null` for existence checks. Never use `=== undefined`.

### Common patterns

```typescript
// WRONG - join converts StyledText to [object Object]
const lines = [t`${fg(color)("line1")}`, t`${fg(color)("line2")}`];
return lines.join("\n");

// WRONG - concatenating StyledText converts to [object Object]
let result = t`${fg(color)("line1")}`;
if (condition) result = t`${result}
${fg(color)("line2")}`; // result becomes [object Object]

// RIGHT - build all content in a single template
return t`${fg(color)("line1")}
${fg(color)("line2")}`;

// RIGHT - use separate return statements for conditional content
if (hasPayload) {
  return t`${fg(c)("Type:")} ${fg(c)(type)}
${fg(c)("Payload:")} ${fg(c)(payload)}`;
}
return t`${fg(c)("Type:")} ${fg(c)(type)}`;

// WRONG - renders during construction before attached
constructor() {
  this.store.onUpdate((data) => this.render()); // fires immediately!
}

// RIGHT - defer subscription
constructor() {
  setTimeout(() => {
    this.store.onUpdate((data) => this.render());
  }, 0);
}
```

### OpenTUI Performance Issues (yoga-layout memory leak)

OpenTUI uses yoga-layout (WASM) internally for layout calculations. There is a **memory leak** that causes progressive slowdown over time, even when reusing elements.

**Symptoms:**
- Memory grows continuously (e.g., 50MB → 200MB+ over a minute) even with fixed element count
- Event loop lag increases from 1-2ms to 5000ms+ over time
- Individual operations remain fast, but cumulative overhead grows
- Setting `.content` or `.backgroundColor` properties triggers internal state accumulation

**Mitigations:**
1. **Pool elements** - Create all renderables upfront, never add/remove dynamically
2. **Minimize property updates** - Only update `.content` when value actually changes
3. **Cache formatted content** - Avoid regenerating StyledText for same data
4. **Batch updates** - Flush UI changes periodically (e.g., every 500ms) not per-event
5. **Reduce element count** - Fewer elements = slower leak accumulation
6. **Skip redundant highlights** - Track last highlighted ID, only update 2 elements (old/new) not all

**Example - Element pooling:**
```typescript
// BAD - creates/destroys elements, leaks memory
private addRow(data: Data) {
  const box = new BoxRenderable(renderer, {...});
  this.list.add(box);
  if (this.rows.length > MAX) {
    const old = this.rows.shift();
    this.list.remove(old.id); // Still leaks internally
  }
}

// GOOD - reuse pooled elements
private rowPool: BoxRenderable[] = [];
private initPool() {
  for (let i = 0; i < MAX_ROWS; i++) {
    const box = new BoxRenderable(renderer, {id: `row-${i}`, ...});
    this.list.add(box);
    this.rowPool.push(box);
  }
}
private updateRow(index: number, content: string) {
  if (this.rowPool[index].text.content !== content) {
    this.rowPool[index].text.content = content; // Only update if changed
  }
}
```

**Example - Efficient highlight:**
```typescript
// BAD - updates all rows every time
highlightRow(id: number) {
  for (const row of this.rows) {
    row.backgroundColor = row.id === id ? selected : normal;
  }
}

// GOOD - only update changed rows
private lastHighlightedId: number | null = null;
highlightRow(id: number) {
  if (id === this.lastHighlightedId) return;
  if (this.lastHighlightedId !== null) {
    this.getRow(this.lastHighlightedId).backgroundColor = normal;
  }
  this.getRow(id).backgroundColor = selected;
  this.lastHighlightedId = id;
}
```
