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

2. **Never call methods that don't exist** - OpenTUI swallows errors. Check method signatures:
   - `scrollBy(delta)` - NOT `scrollBy(x, y)`
   - `scrollTo(position)` - NOT `scrollTo(x, y)`
   - Use `getChildren()` + `remove(id)` - NOT `.clear()`

3. **Never render during constructor** - If a component subscribes to events that fire immediately (like `nodeStore.onUpdate()`), defer with `setTimeout(() => {...}, 0)` to let the component attach to the render tree first.

4. **Never access UI elements before they're created** - Ensure initialization order is correct. Create status bars/text elements before calling functions that update them.

### Common patterns

```typescript
// WRONG - join converts StyledText to [object Object]
const lines = [t`${fg(color)("line1")}`, t`${fg(color)("line2")}`];
return lines.join("\n");

// RIGHT - build with template literal
return t`${fg(color)("line1")}
${fg(color)("line2")}`;

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
