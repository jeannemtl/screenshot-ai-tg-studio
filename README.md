# Screenshot AI Studio - Rust Implementation

This is a complete RUST implementation of the iOS Screenshot AI Server that you can host locally to automatically track your Macbook ios screenshots as you take them. If you’re a visual note taker and take a lot of screenshots this may be useful. 

Unfortunately, it doesn’t persist (I’ll need to build that out if there’s interest), so if you shut it down it obviously starts from the initial state. The only way to track and timestamp all of your screenshots through this RUST implementation is to tie it to your Telegram bot app (Create your own bot, get your bot token and chat id from Telegram’s @botfather). All your screenshots are saved in your bot timeline, timestamped with a Claude based summary through your own Claude API.

## Features

- Automatic Screenshot Detection: Monitors your macOS screenshots folder in real-time
- AI-Powered Analysis: Uses Claude AI to generate intelligent summaries of your screenshots
- Telegram Integration: Saves all screenshots with timestamps and summaries to your personal Telegram bot
- Modern Desktop App: Built with Tauri for a native, fast experience
- Real-time Processing: Instant analysis as screenshots are captured
- Visual Gallery: Browse and search through your processed screenshots

<img width="1010" height="989" alt="Screenshot 2025-08-27 at 11 42 09 AM" src="https://github.com/user-attachments/assets/30eb6e78-c092-4638-a390-9781a5a1a4dd" />

<img width="1202" height="786" alt="Screenshot 2025-08-27 at 11 47 54 AM" src="https://github.com/user-attachments/assets/f85f01f2-8551-448c-97ea-2db8b7a3cf25" />

<img width="1185" height="750" alt="Screenshot 2025-08-27 at 11 48 12 AM" src="https://github.com/user-attachments/assets/2f9265b0-c309-43e9-87dc-a791aada3cea" />

## Installation & Setup

### Prerequisites
- **Rust**: Install from [rustup.rs](https://rustup.rs/)
- **Node.js**: Version 16+ from [nodejs.org](https://nodejs.org/)
- **Tauri CLI**: `cargo install tauri-cli`

### 1. Clone, Build and Run

```bash
# Install Node dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## ⚙️ Configuration

### GUI Configuration
1. Launch the app
2. Click "Configure & Start" in the Server tab
3. Enter your API keys and preferences
4. Click "Start Server"
<img width="1192" height="492" alt="Screenshot 2025-08-27 at 11 16 21 AM" src="https://github.com/user-attachments/assets/ddb85123-a9c2-4d10-abe9-2e6c16d77e67" />
