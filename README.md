# MONOklix - Unified Version

All-in-one AI platform powered by MONOklix! 

**Unified version that works for both Electron (Desktop) and Web deployment.**

## 🚀 Features

### Core Features
- ✅ **Unified Codebase** - One codebase for both Electron and Web
- ✅ **Auto-Environment Detection** - Automatically detects if running in Electron or Web
- ✅ **Same UI** - Identical user interface for both platforms
- ✅ **Conditional Features** - Features adapt based on environment:
  - **Electron**: Uses localhost server only
  - **Web**: Supports multiple proxy servers with load balancing
- ✅ **Server Health Check** - Real-time status indicator for operational servers
- ✅ **System Activity Log** - Real-time console log monitoring with debug toggle

### AI Services

#### 🎬 Video Generation
- **Veo 3** - Text-to-Video and Image-to-Video generation
- Video status tracking and download
- Video cache management
- **Video Combiner** - Available in Electron and localhost (requires FFmpeg)

#### 🖼️ Image Generation
- **Imagen 3.5** - Text-to-Image generation
  - Multiple aspect ratios (Portrait, Landscape, Square)
  - Negative prompts support
  - Reference images (Image-to-Image)
  - Image upscaling
- **NANOBANANA 2** - Google's GEM_PIX_2 model
  - Text-to-Image generation
  - Image-to-Image with reference images
  - Multiple aspect ratios
  - Image download via proxy (CORS bypass)
  - Gallery integration with base64 storage

#### 📝 Text Generation
- **Gemini** - Text generation and chat interface
- Multiple AI models support
- Creative direction controls

#### 🎨 Content Creation
- Marketing Copy Generator
- Social Post Studio
- Product Ad Generator
- Product Review Generator
- Content Ideas Generator
- Prompt Library Management

### 🔐 Authentication & Security

#### Token Management
- **Personal Auth Token** - Manual token management via Flow Login
- **Token Ultra** - Premium subscription service (RM20)
  - Automatic token generation
  - Master reCAPTCHA token support
  - `allow_master_token` preference control
  - Email credentials management
- **reCAPTCHA Token** - Automatic injection for protected endpoints
  - Anti-Captcha API integration
  - Master token for Token Ultra users
  - Personal token fallback

#### Flow Login Features
- Manual token input and save
- "Generate NEW Token" - Automatic token generation from server
- "Health Test" - Comprehensive token testing
- "Video Tutorial" - Login Google Flow tutorial video
- Auto-hide "Login Google Flow" and "Get Token" buttons for active Token Ultra users

### 📊 User Management
- Supabase integration for user profiles
- Usage tracking (images, videos, text)
- Gallery with history management
- Image and video caching
- IndexedDB for offline storage

### 🎯 Advanced Features

#### Server Management
- Multiple proxy servers (s1-s12.monoklix.com)
- Server selection UI with usage statistics
- Automatic server health monitoring
- Server switching with event bus

#### API Integration
- Unified API client (`apiClient.ts`)
- Automatic reCAPTCHA token injection
- Rate limiting with server slot management
- Token resolution (Personal → Database → Fallback)

#### UI/UX
- Dark mode support
- Responsive design
- Real-time status updates
- Modal dialogs for actions
- Loading states and error handling
- Keyboard shortcuts (ESC to close modals)

## 🔧 Technical Details

### Environment Detection
The app automatically detects:
- **Electron**: `window.location.protocol === 'file:'` or Electron user agent
- **Web Localhost**: `hostname === 'localhost'` or `127.0.0.1`
- **Web Production**: `hostname === 'app.monoklix.com'` or `dev.monoklix.com`

### Server Configuration
- **Electron**: Always uses `localhost:3001`
- **Web**: Supports multiple servers with selection UI
- Server usage tracking and statistics
- Health check endpoint (`/health`)

### API Endpoints

#### Client-side Services
- `services/veo3Service.ts` - Veo 3 video generation
- `services/imagenV3Service.ts` - Imagen 3.5 image generation
- `services/nanobanana2Service.ts` - NANOBANANA 2 image generation
- `services/geminiService.ts` - Gemini text generation
- `services/apiClient.ts` - Unified API client with reCAPTCHA injection

#### Server Endpoints (`server/index.js`)
- `/api/veo/generate-t2v` - Veo Text-to-Video
- `/api/veo/generate-i2v` - Veo Image-to-Video
- `/api/veo/status` - Video status check
- `/api/veo/download` - Video download (CORS bypass)
- `/api/imagen/generate` - Imagen image generation
- `/api/imagen/upload` - Image upload for Imagen
- `/api/imagen/run-recipe` - Imagen image editing
- `/api/nanobanana/generate` - NANOBANANA 2 image generation
- `/api/nanobanana/download-image` - Image download proxy (CORS bypass)
- `/api/video/combine` - Video combiner (requires FFmpeg)
- `/health` - Server health check

### reCAPTCHA Token Injection
- **Veo**: Injected in top-level `clientContext.recaptchaToken`
- **NANOBANANA 2**: Injected in top-level `clientContext.recaptchaToken` (same as Veo)
- **Imagen**: No reCAPTCHA required
- Automatic token generation via Anti-Captcha API
- Master token support for Token Ultra users

### Token Ultra Logic
1. All users use personal API key by default
2. If Token Ultra active → use master API key from `master_recaptcha_tokens`
3. If `allow_master_token = false` → fallback to personal API key
4. reCAPTCHA token injected based on resolved API key

## 📦 Installation

```bash
npm install
```

### Server Setup
```bash
cd server
npm install
```

### Optional: FFmpeg Installation
For video combiner feature (Electron/localhost only):
- Install FFmpeg on your system
- Server will automatically detect and enable the feature

## 🛠️ Development

### Start Development Server
```bash
# Start React dev server
npm run dev

# Start backend server (in separate terminal)
cd server
npm start
```

### Using start.bat (Windows)
```bash
start.bat
```
This will start both the React dev server and the backend server automatically.

## 🏗️ Building

```bash
npm run build
```

Build output will be in the `dist/` directory.

## 📁 Project Structure

```
VERSION ALL NEW/
├── components/          # React components
│   ├── common/         # Shared components
│   └── views/          # View components
├── services/           # Service layer
│   ├── apiClient.ts    # Unified API client
│   ├── veo3Service.ts  # Veo 3 service
│   ├── imagenV3Service.ts  # Imagen service
│   ├── nanobanana2Service.ts  # NANOBANANA 2 service
│   └── ...
├── server/             # Backend server
│   └── index.js        # Express server
├── types.ts            # TypeScript types
├── App.tsx             # Main app component
└── index.tsx           # Entry point
```

## 🔑 Configuration

### Environment Variables
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

### Service Configuration
- `services/appConfig.ts` - Application version and API URLs
- `services/serverConfig.ts` - Proxy server configuration
- `services/environment.ts` - Environment detection utilities

### Server Configuration
- `server/index.js` - Backend server configuration
- FFmpeg dependencies are optional - server works without them

## 📝 Recent Updates

### NANOBANANA 2 Integration
- ✅ Full text-to-image and image-to-image support
- ✅ Reference image upload and processing
- ✅ Image download via proxy (CORS bypass)
- ✅ Gallery integration with base64 storage
- ✅ Aspect ratio controls
- ✅ reCAPTCHA token injection (top-level only, same as Veo)

### Token Ultra Enhancements
- ✅ Master reCAPTCHA token support
- ✅ `allow_master_token` preference control
- ✅ Auto-hide manual token buttons for active users
- ✅ Registration status caching

### UI Improvements
- ✅ Preview modal full height display
- ✅ Close button always visible
- ✅ System Activity Log with debug toggle
- ✅ Server health status indicator

### Code Cleanup
- ✅ Removed unused code and imports
- ✅ Unified reCAPTCHA injection logic (Veo and NANOBANANA 2)
- ✅ Consistent error handling

## 🐛 Known Limitations

### 2K/4K Image Generation
- NANOBANANA 2 2K/4K download feature is currently on hold
- API may require different endpoint or parameters
- Client-side upscaling implementation available but not activated

### Video Combiner
- Only available in Electron and localhost environments
- Requires FFmpeg installation
- Hidden in production web environment

## 📄 License

Private - All rights reserved

## 🔗 Links

- Production: `https://app.monoklix.com`
- Development: `https://dev.monoklix.com`
- API: `https://api.monoklix.com`

## 👨‍💻 Development Notes

- UI is identical for both Electron and Web versions
- Behavior adapts automatically based on detected environment
- All features from both previous versions are included
- Server selection is available in both versions (but Electron only shows localhost)
