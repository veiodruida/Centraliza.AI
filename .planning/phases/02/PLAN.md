# Phase 2 Plan: UX Core & Help System

## Goal
Improve accessibility for layman users and automate the initial app configuration.

## Requirements
- **SET-01**: Auto-detect paths immediately on Settings page load.
- **HLP-01**: Add contextual help/tooltips across all major functions.

## 🛠️ Step 1: Automated Settings Detection (SET-01)
1. Modify `Settings.tsx` to include an `useEffect` that triggers `handleAutoDetect` automatically if it's the first visit or if paths are missing.
2. Remove the alert from `handleAutoDetect` during auto-load to avoid annoying the user.

## 🛠️ Step 2: Global Help Component (HLP-01)
1. Create `frontend/src/components/HelpTooltip.tsx` using `lucide-react`'s `Info` or `HelpCircle` icon.
2. The component should show a nice glassmorphism tooltip on hover/click with a simple explanation.

## 🛠️ Step 3: Inject Help across Pages (HLP-01)
Add help tooltips to:
- **Home**: Explaining the model landscape.
- **My Models**: Explaining centralization and linking.
- **Settings**: Explaining each path type.
- **Hardware Lab**: Explaining VRAM and GPU metrics.

## Verification
- [ ] Navigating to Settings page triggers a scan (can be seen in terminal/network tab).
- [ ] Help icons are visible and interactive on at least 3 pages.
- [ ] No regressions in Settings saving/loading.
