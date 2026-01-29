# Fix pnpm Installation Issue

The error you're seeing is due to a corrupted pnpm installation. Here are the solutions:

## Quick Fix (Recommended)

1. **Remove node_modules and reinstall:**
   ```bash
   cd zorroflex
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

2. **If that fails, use npm instead:**
   ```bash
   cd zorroflex
   rm -rf node_modules pnpm-lock.yaml .npmrc
   npm install
   ```

## Fix pnpm Installation

The error `%1 is not a valid Win32 application` means pnpm is corrupted:

```bash
# Uninstall pnpm
npm uninstall -g pnpm

# Reinstall pnpm
npm install -g pnpm@latest

# Or use corepack (Node.js 16.10+)
corepack enable
corepack prepare pnpm@latest --activate
```

## Alternative: Use npm

If pnpm continues to have issues, the app works fine with npm:

```bash
cd zorroflex
rm -rf node_modules pnpm-lock.yaml .npmrc
npm install
npm run build
npm run dev
```

The postinstall script will now skip gracefully if it fails, so the installation should complete.
