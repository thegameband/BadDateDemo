---
name: Drop a Line Button
overview: Add a hidden "Drop a Line" game mode button to the main menu that can be enabled via a debug menu toggle. The button will be wired to a new view placeholder for now.
todos:
  - id: state
    content: Add dropALineEnabled state with localStorage persistence
    status: completed
  - id: debug-toggle
    content: Add Experiments section with Drop a Line toggle to debug menu
    status: completed
  - id: main-button
    content: Add conditional Drop a Line button to main menu
    status: completed
  - id: placeholder-view
    content: Add placeholder drop-a-line view with back button
    status: completed
  - id: css
    content: Style the Drop a Line button in LiveLobby.css
    status: completed
  - id: deploy
    content: Bump GAME_VERSION, commit, and push to deploy
    status: completed
isProject: false
---

# Drop a Line Button Setup

## Summary

Add a "Drop a Line" button to the main menu in [src/components/LiveLobby.jsx](src/components/LiveLobby.jsx). The button is hidden by default and only appears after being enabled via a new toggle in the debug menu. Persist the toggle state in `localStorage` so it survives page reloads.

## Changes

### 1. Add state for the toggle (LiveLobby.jsx)

Add a `dropALineEnabled` state variable initialized from `localStorage`:

```javascript
const [dropALineEnabled, setDropALineEnabled] = useState(
  () => localStorage.getItem('dropALineEnabled') === 'true'
)
```

### 2. Add debug menu toggle (LiveLobby.jsx)

In the debug menu, add a new section (under "Modes") with a toggle button for "Drop a Line":

```jsx
<div className="debug-section">
  <div className="debug-section-label">Experiments</div>
  <button
    className="debug-action-btn debug-toggle-btn"
    onClick={() => {
      const next = !dropALineEnabled
      setDropALineEnabled(next)
      localStorage.setItem('dropALineEnabled', String(next))
    }}
  >
    <span className="btn-icon">🎣</span>
    <span>Drop a Line</span>
    <span className={`debug-toggle ${dropALineEnabled ? 'on' : 'off'}`}>
      {dropALineEnabled ? 'ON' : 'OFF'}
    </span>
  </button>
</div>
```

### 3. Add main menu button (LiveLobby.jsx)

Below the existing "Play Now" button in the `.main-buttons` div (~line 722), conditionally render the new button:

```jsx
{dropALineEnabled && (
  <motion.button
    className="mode-btn drop-a-line-btn"
    onClick={() => setView('drop-a-line')}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
  >
    <span className="btn-icon">🎣</span>
    <span className="btn-text">Drop a Line</span>
  </motion.button>
)}
```

### 4. Add placeholder view (LiveLobby.jsx)

Add a minimal placeholder view for `view === 'drop-a-line'` with a back button, so the button has somewhere to go:

```jsx
if (view === 'drop-a-line') {
  return (
    <div className="live-lobby main-lobby">
      <div className="version-number">v{GAME_VERSION}</div>
      <motion.div className="live-lobby-card" ...>
        <div className="live-lobby-header">
          <button className="back-btn" onClick={() => setView('main')}>← Back</button>
          <h2>Drop a Line</h2>
        </div>
        <p style={{ textAlign: 'center', opacity: 0.6 }}>Coming soon...</p>
      </motion.div>
    </div>
  )
}
```

### 5. Style the button (LiveLobby.css)

Add a `.drop-a-line-btn` style that visually distinguishes it from the "Play Now" button (e.g., a different accent color or border treatment) so it reads as a secondary mode option.

### 6. Deploy

Bump `GAME_VERSION`, commit, and push to trigger Vercel deployment.

## Files touched

- [src/components/LiveLobby.jsx](src/components/LiveLobby.jsx) -- state, debug toggle, main menu button, placeholder view
- [src/components/LiveLobby.css](src/components/LiveLobby.css) -- button styling
