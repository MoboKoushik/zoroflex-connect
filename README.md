# Tally Sync Electron App

Electron application that syncs data from Tally (localhost:9000) to Nest backend API endpoints. Uses SQLite for history tracking and runs in background mode.

## Features

- **Tally Integration**: Connects to Tally via XML API on port 9000
- **Data Sync**: Syncs Vouchers, Ledgers, and Inventory to Nest backend
- **History Tracking**: SQLite database tracks sync history, logs, and data changes
- **Multiple Sync Modes**: 
  - Real-time sync (configurable interval)
  - Scheduled sync (cron-based)
  - Manual sync trigger
- **Background Operation**: Runs in system tray, starts automatically
- **Configuration**: Manage Nest backend URL, API keys, and sync intervals

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Run the app:
```bash
npm start
```

## Configuration

The app stores configuration in Electron Store. Configure the following:

- **Nest Backend URL**: Your Nest backend base URL
- **API Key**: Authentication token for Nest backend
- **Tally URL**: Tally server URL (default: http://localhost:9000)
- **Sync Intervals**: 
  - Real-time interval (milliseconds)
  - Scheduled cron expression
- **Enabled Sync Types**: Enable/disable real-time, scheduled, or manual sync

## Project Structure

```
src/
├── main/              # Electron main process
├── renderer/         # UI (minimal, for tray)
├── services/
│   ├── tally/        # Tally integration
│   ├── api/          # Nest backend integration
│   ├── database/     # SQLite operations
│   ├── sync/         # Sync orchestration
│   └── config/       # Configuration management
└── types/            # TypeScript types
```

## Usage

1. **Start the app**: The app will start in background mode and appear in system tray
2. **Configure**: Set Nest backend URL and API key (via code/config)
3. **Automatic Sync**: Real-time and scheduled sync will start automatically if enabled
4. **Manual Sync**: Right-click tray icon and select "Sync Now"
5. **View Window**: Double-click tray icon or select "Show Window"

## Database

SQLite database is stored in app user data directory:
- Windows: `%APPDATA%/tally-sync/tally-sync.db`
- macOS: `~/Library/Application Support/tally-sync/tally-sync.db`
- Linux: `~/.config/tally-sync/tally-sync.db`

## API Endpoints

The app expects the following Nest backend endpoints:

- `POST /api/tally/vouchers` - Sync vouchers
- `POST /api/tally/ledgers` - Sync ledgers
- `POST /api/tally/inventory` - Sync inventory
- `GET /api/tally/status` - Check sync status

All requests include Bearer token authentication.

## Development

```bash
# Watch mode
npm run watch

# Development
npm run dev

# Build for production
npm run build

# Package app
npm run package
```

## Requirements

- Node.js 18+
- Tally running on localhost:9000
- Nest backend with API endpoints configured

