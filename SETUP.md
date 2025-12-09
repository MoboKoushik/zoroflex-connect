# Setup Guide

## Initial Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Project**
   ```bash
   npm run build
   ```

3. **Configure the Application**

   Before running, you need to configure the Nest backend URL and API key. You can do this programmatically or by modifying the default config in `src/services/config/config-manager.ts`.

   Example configuration code:
   ```typescript
   const configManager = new ConfigManager();
   configManager.setNestBackendUrl('http://your-nest-backend-url');
   configManager.setApiKey('your-api-key');
   ```

4. **Run the Application**
   ```bash
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

## Configuration

The app stores configuration using Electron Store. Default configuration:

- **Tally URL**: `http://localhost:9000`
- **Nest Backend URL**: Empty (needs to be set)
- **API Key**: Empty (needs to be set)
- **Real-time Sync Interval**: 60000ms (1 minute)
- **Scheduled Sync**: `*/15 * * * *` (Every 15 minutes)
- **Enabled Sync Types**: All enabled by default

## Tally Setup

Ensure Tally is running and accessible on `http://localhost:9000`. The Tally XML API should be enabled.

## Nest Backend Requirements

Your Nest backend should have the following endpoints:

- `POST /api/tally/vouchers` - Accepts vouchers data
- `POST /api/tally/ledgers` - Accepts ledgers data  
- `POST /api/tally/inventory` - Accepts inventory data
- `GET /api/tally/status` - Returns sync status

All endpoints should accept Bearer token authentication.

## Database Location

SQLite database is automatically created in:
- **Windows**: `%APPDATA%/tally-sync/tally-sync.db`
- **macOS**: `~/Library/Application Support/tally-sync/tally-sync.db`
- **Linux**: `~/.config/tally-sync/tally-sync.db`

## Usage

1. **Start the app**: It will run in background and appear in system tray
2. **Right-click tray icon**: Access menu options
   - Show Window
   - Sync Now (manual sync)
   - Restart Sync Services
   - Quit
3. **Double-click tray icon**: Show/hide main window

## Troubleshooting

- **Tally connection fails**: Ensure Tally is running on port 9000
- **Nest backend errors**: Check API key and backend URL configuration
- **Sync not working**: Check sync logs in SQLite database or console output

