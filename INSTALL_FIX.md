# Installation Fix Guide

If you encounter errors with `pnpm install` related to native dependencies:

## Option 1: Clean Install (Recommended)

```bash
# Remove node_modules and lockfile
rm -rf node_modules pnpm-lock.yaml

# Reinstall
pnpm install
```

## Option 2: Skip Native Rebuild (For Development)

If the postinstall script fails, you can skip it:

```bash
# Install without running postinstall
pnpm install --ignore-scripts

# Then manually rebuild native modules if needed
pnpm rebuild
```

## Option 3: Use npm instead

If pnpm continues to have issues:

```bash
# Remove pnpm files
rm -rf node_modules pnpm-lock.yaml .npmrc

# Use npm
npm install
```

## Option 4: Fix pnpm Installation

The error `%1 is not a valid Win32 application` suggests pnpm installation issue:

```bash
# Reinstall pnpm globally
npm uninstall -g pnpm
npm install -g pnpm@latest

# Or use npx
npx pnpm install
```

## Native Dependencies

The app uses these native modules that need to be rebuilt for Electron:
- `better-sqlite3` - SQLite database
- `odbc` - ODBC database connectivity

These will be automatically rebuilt during `electron-builder install-app-deps` or you can manually rebuild with:
```bash
pnpm rebuild
```
