# Deployment

When pushing the game live:

1. **Increment the build number** in:
   - `package.json` → `version`
   - `src/components/LiveLobby.jsx` → `GAME_VERSION`
2. Commit and push.
3. Tell the user the new version number (e.g. **Version 0.02.XX**).
