# Agent Instructions

## Post-Update Deployment

CRITICAL: For **every user instruction that results in code or content changes**, you must:

1. **Increment the build number** in `src/components/LiveLobby.jsx` (the `GAME_VERSION` constant).
2. **Commit all changes** with a descriptive message.
3. **Push to git** (`git push`) to trigger a Vercel auto-deploy.
4. **Report the new build number** to the user.

If no repository files changed for a request, explicitly state that no deployment was required.
