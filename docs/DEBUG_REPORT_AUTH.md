# Developer Handover: Auth Configuration Issue

## Problem Statement
The Next.js frontend is failing to load environment variables defined in `frontend/.env.local`, leading to a `FirebaseError: (auth/invalid-api-key)` at runtime because `process.env.NEXT_PUBLIC_FIREBASE_API_KEY` is resolving to `undefined`.

## Symptoms
- **Console Error**: `Firebase: Error (auth/invalid-api-key)` in `lib/firebase.ts`.
- **Runtime State**: Manual logging in `firebase.ts` shows `apiKey: 'UNDEFINED'`, `projectId: undefined`.
- **Config State**: Logging in `next.config.ts` during startup confirms `process.env` is empty for these keys.

## Diagnostics Conducted
1.  **Code Integrity**: `frontend/lib/firebase.ts` was refactored from hardcoded values to `process.env` lookups.
2.  **File Verification**: 
    - Internal `list_dir` shows `.env.local` exists (850 bytes).
    - User has verified the file contains the correct keys from the Firebase Console.
3.  **Cache/Restart**:
    - `.next` directory has been deleted to clear build cache.
    - Development server (`npm run dev`) has been restarted multiple times.
4.  **Backend State**: Backend loads its own `serviceAccountKey.json` correctly; this is strictly a frontend/environment loading issue.

## Current Blockers / Hypotheses
- **File Encoding**: Suspected encoding issue (e.g., UTF-16 with BOM saves from certain editors) which Next.js sometimes silently skips.
- **Environment Context**: We attempted to rename `.env.local` to `.env` using a command line tool which failed due to shell permissions/syntax, so the file name shift remains untested.
- **System Policy**: The user's system has PowerShell execution restrictions which blocked some automated diagnostic scripts (`npm install` etc.), complicating deeper inspection of the Node process environment.

## Suggested Next Steps for Second Opinion
1.  **Forced File Recreation**: Delete the manual `.env.local` and create a fresh one via `echo` or a different text editor to ensure plain UTF-8 encoding.
2.  **Environment Variable Injection**: Try running `NEXT_PUBLIC_FIREBASE_API_KEY=xxx npm run dev` directly in the shell to see if Next.js picks up shell-level variables.
3.  **Pathing**: Cross-check if there is any parent `.env` logic interfering with the child directory.
