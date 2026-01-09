# MONOklix - Unified Version

All-in-one AI platform powered by MONOklix! 

**Unified version that works for both Electron (Desktop) and Web deployment.**

## Features

- ✅ **Unified Codebase** - One codebase for both Electron and Web
- ✅ **Auto-Environment Detection** - Automatically detects if running in Electron or Web
- ✅ **Same UI** - Identical user interface for both platforms
- ✅ **Conditional Features** - Features adapt based on environment:
  - **Electron**: Uses localhost server only
  - **Web**: Supports multiple proxy servers with load balancing
- ✅ **Video Combiner** - Available in Electron (requires FFmpeg), graceful fallback in Web

## Key Differences from Previous Versions

### Environment Detection
- New `services/environment.ts` utility detects Electron vs Web
- Auto-configures API URLs, server selection, and features

### Server Management
- **Electron**: Always uses `localhost:3001`
- **Web**: Supports multiple servers (s1-s12.monoklix.com) with selection UI

### UI Components
- All UI components are the same for both platforms
- Server selection modal shows info message in Electron mode
- ApiKeyStatus component available in both versions

## Installation

```bash
npm install
```

## Development

```bash
# Start development server
npm run dev

# Start backend server (in separate terminal)
cd server
npm install
npm start
```

## Building

```bash
npm run build
```

## Server

The server (`server/index.js`) supports:
- Veo3 API endpoints
- Imagen API endpoints  
- Video download (CORS bypass)
- Video combiner (if FFmpeg available)

FFmpeg dependencies are optional - server will work without them, but video combiner will be disabled.

## Environment Detection

The app automatically detects:
- **Electron**: `window.location.protocol === 'file:'` or Electron user agent
- **Web Localhost**: `hostname === 'localhost'`
- **Web Production**: `hostname === 'app.monoklix.com'` or `dev.monoklix.com`

## Configuration

- `services/appConfig.ts` - Application version and API URLs (auto-detects)
- `services/serverConfig.ts` - Proxy server configuration (conditional)
- `services/environment.ts` - Environment detection utilities

## Notes

- UI is identical for both Electron and Web versions
- Behavior adapts automatically based on detected environment
- All features from both previous versions are included
- Server selection is available in both versions (but Electron only shows localhost)
