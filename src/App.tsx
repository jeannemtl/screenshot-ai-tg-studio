// src/App.tsx

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, BarChart3, Server } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

// Components
import DropZone from './components/DropZone';
import ServerConfig from './components/ServerConfig';

// Types
interface Screenshot {
  id: string;
  name: string;
  size: number;
  type: string;
  timestamp: string;
  status: 'processing' | 'completed' | 'error';
  analysis?: string;
}

interface ProcessingResponse {
  success: boolean;
  summary?: string;
  analysis_id?: string;
  timestamp: string;
  follow_up_available?: boolean;
  source?: string;
  error?: string;
}

type ActiveTab = 'gallery' | 'server' | 'settings';

function App() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('gallery');

  // Load existing screenshots and listen for new ones
  useEffect(() => {
    // Load existing screenshots
    const loadScreenshots = async () => {
      try {
        const existing = await invoke<any[]>('get_recent_screenshots');
        setScreenshots(existing.map(item => ({
          id: item.id,
          name: item.name,
          size: item.size,
          type: item.type,
          timestamp: item.timestamp,
          status: item.status,
          analysis: item.analysis
        })));
      } catch (error) {
        console.error('Failed to load screenshots:', error);
      }
    };

    // Listen for new screenshots being processed
    const setupListener = async () => {
      const unlisten = await listen('screenshot-processed', (event) => {
        const screenshotData = event.payload as any;
        const newScreenshot: Screenshot = {
          id: screenshotData.id,
          name: screenshotData.name,
          size: screenshotData.size,
          type: screenshotData.type,
          timestamp: screenshotData.timestamp,
          status: screenshotData.status,
          analysis: screenshotData.analysis
        };
        
        setScreenshots(prev => [newScreenshot, ...prev]);
      });

      return unlisten;
    };

    loadScreenshots();
    setupListener();
  }, []);

  // Handle file uploads with new Rust backend
  const handleFilesDropped = useCallback(async (files: FileList) => {
    console.log('Files dropped:', files.length);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Only process image files
      if (!file.type.startsWith('image/')) {
        continue;
      }

      const screenshot: Screenshot = {
        id: `${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type,
        timestamp: new Date().toISOString(),
        status: 'processing'
      };

      // Add to state
      setScreenshots(prev => [screenshot, ...prev]);
      setIsProcessing(true);
      setProcessingCount(prev => prev + 1);

      try {
        // Convert file to base64
        const base64 = await fileToBase64(file);
        
        // Process with Rust backend
        const result = await invoke<ProcessingResponse>('process_screenshot_direct', {
          imageBase64: base64,
          metadata: {
            source: 'frontend_upload',
            app: 'Screenshot AI Studio',
            filename: file.name,
          }
        });
        
        // Update with results
        setScreenshots(prev => prev.map(s => 
          s.id === screenshot.id 
            ? { 
                ...s, 
                status: result.success ? 'completed' : 'error',
                analysis: result.success ? result.summary : result.error
              }
            : s
        ));

        if (result.success) {
          console.log('✅ Screenshot processed successfully:', result);
        } else {
          console.error('❌ Processing failed:', result.error);
        }

      } catch (error) {
        console.error('Processing failed:', error);
        setScreenshots(prev => prev.map(s => 
          s.id === screenshot.id 
            ? { ...s, status: 'error', analysis: `Processing failed: ${error}` }
            : s
        ));
      } finally {
        setProcessingCount(prev => prev - 1);
        if (processingCount <= 1) {
          setIsProcessing(false);
        }
      }
    }
  }, [processingCount]);

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleTestGreet = async () => {
    try {
      const result = await invoke('greet', { name: 'Desktop App' });
      console.log('Greet result:', result);
    } catch (error) {
      console.error('Greet failed:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: Screenshot['status']) => {
    switch (status) {
      case 'processing': return '#ffa500';
      case 'completed': return '#00ff88';
      case 'error': return '#ff4444';
      default: return '#888';
    }
  };

  const getStatusIcon = (status: Screenshot['status']) => {
    switch (status) {
      case 'processing': return '⏳';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '📷';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Spotify-style Header */}
      <header className="header-container">
        <div className="header-content">
          <div className="nav-left">
            <a href="#" className="logo">
              📸 Screenshot AI Studio
            </a>
            <nav>
              <ul className="nav-links">
                <li>
                  <a 
                    href="#" 
                    className={activeTab === 'gallery' ? 'active' : ''}
                    onClick={() => setActiveTab('gallery')}
                  >
                    <BarChart3 size={16} />
                    Gallery
                  </a>
                </li>
                <li>
                  <a 
                    href="#" 
                    className={activeTab === 'server' ? 'active' : ''}
                    onClick={() => setActiveTab('server')}
                  >
                    <Server size={16} />
                    Server
                  </a>
                </li>
                <li>
                  <a 
                    href="#" 
                    className={activeTab === 'settings' ? 'active' : ''}
                    onClick={() => setActiveTab('settings')}
                  >
                    <Settings size={16} />
                    Settings
                  </a>
                </li>
              </ul>
            </nav>
          </div>
          <div className="nav-right">
            <span className="status-badge">
              {isProcessing ? 
                `Processing ${processingCount}...` : 
                `${screenshots.length} Screenshots`
              }
            </span>
            <button 
              onClick={handleTestGreet}
              className="test-btn"
            >
              Test
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {activeTab === 'gallery' && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Drop Zone */}
              <DropZone onFilesDropped={handleFilesDropped} />

              {/* Screenshots Gallery */}
              {screenshots.length > 0 && (
                <div>
                  <div className="section-header">
                    <h2 className="section-title">Recent Screenshots</h2>
                    <p className="section-subtitle">
                      AI-powered analysis of your screenshots
                    </p>
                  </div>

                  <div className="screenshots-grid">
                    <AnimatePresence>
                      {screenshots.map((screenshot) => (
                        <motion.div
                          key={screenshot.id}
                          className="screenshot-card"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="screenshot-header">
                            <div className="screenshot-info">
                              <h3 className="screenshot-title">{screenshot.name}</h3>
                              <div className="screenshot-meta">
                                <span className="file-size">
                                  {formatFileSize(screenshot.size)}
                                </span>
                                <span 
                                  className="status-indicator"
                                  style={{ color: getStatusColor(screenshot.status) }}
                                >
                                  {getStatusIcon(screenshot.status)} {screenshot.status}
                                </span>
                                <div className="timestamp">
                                  {screenshot.status === 'processing' 
                                    ? 'Processing...' 
                                    : formatTime(screenshot.timestamp)
                                  }
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {screenshot.analysis && (
                            <div className="screenshot-analysis">
                              {screenshot.analysis}
                            </div>
                          )}
                          
                          <div className="screenshot-actions">
                            <button className="action-btn">
                              <span>📋</span>
                              Copy
                            </button>
                            <button className="action-btn">
                              <span>🔗</span>
                              Share
                            </button>
                            <button className="action-btn">
                              <span>⭐</span>
                              Save
                            </button>
                            <button className="expand-btn">View</button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Made for You Section (if no screenshots) */}
              {screenshots.length === 0 && !isProcessing && (
                <div>
                  <div className="section-header">
                    <h2 className="section-title">Made for you</h2>
                    <p className="section-subtitle">Get started with AI-powered screenshot analysis</p>
                  </div>

                  <motion.div 
                    className="empty-state"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="empty-icon">📸</div>
                    <h3>No screenshots yet</h3>
                    <p>Drag and drop your screenshots above to get started with AI analysis</p>
                    
                    <div className="feature-grid">
                      <div className="feature-item">
                        <div className="feature-icon">🤖</div>
                        <h4>AI Analysis</h4>
                        <p>Get instant insights about your screenshots</p>
                      </div>
                      <div className="feature-item">
                        <div className="feature-icon">📱</div>
                        <h4>iOS Integration</h4>
                        <p>Connect your iPhone for automatic processing</p>
                      </div>
                      <div className="feature-item">
                        <div className="feature-icon">🖥️</div>
                        <h4>Desktop Auto-Detection</h4>
                        <p>Automatically process Mac screenshots</p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'server' && (
            <motion.div
              key="server"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="section-header">
                <h2 className="section-title">
                  <Server size={24} />
                  Screenshot Server
                </h2>
                <p className="section-subtitle">
                  Configure and manage your AI screenshot processing server
                </p>
              </div>
              <ServerConfig />
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="section-header">
                <h2 className="section-title">
                  <Settings size={24} />
                  Settings
                </h2>
                <p className="section-subtitle">
                  Customize your Screenshot AI Studio experience
                </p>
              </div>
              
              <div className="settings-grid">
                <div className="settings-card">
                  <h3>🎨 Appearance</h3>
                  <p>Theme and display preferences</p>
                  <button className="settings-btn">Configure</button>
                </div>
                
                <div className="settings-card">
                  <h3>🔔 Notifications</h3>
                  <p>Desktop and system notifications</p>
                  <button className="settings-btn">Configure</button>
                </div>
                
                <div className="settings-card">
                  <h3>🗂️ Storage</h3>
                  <p>File storage and cleanup options</p>
                  <button className="settings-btn">Configure</button>
                </div>
                
                <div className="settings-card">
                  <h3>🔒 Privacy</h3>
                  <p>Data handling and privacy settings</p>
                  <button className="settings-btn">Configure</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        /* Header Styles */
        .header-container {
          background: linear-gradient(180deg, #121212 0%, #1e1e1e 100%);
          border-bottom: 1px solid #333;
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(20px);
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
        }

        .nav-left {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .logo {
          font-size: 20px;
          font-weight: 700;
          color: white;
          text-decoration: none;
          transition: color 0.2s;
        }

        .logo:hover {
          color: #00ff88;
        }

        .nav-links {
          display: flex;
          list-style: none;
          margin: 0;
          padding: 0;
          gap: 24px;
        }

        .nav-links a {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #b3b3b3;
          text-decoration: none;
          font-weight: 500;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .nav-links a:hover,
        .nav-links a.active {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .status-badge {
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgba(0, 255, 136, 0.3);
        }

        .test-btn {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid #333;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .test-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        /* Main Content */
        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 24px;
          min-height: calc(100vh - 64px);
        }

        .section-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .section-title {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 48px;
          font-weight: 900;
          background: linear-gradient(135deg, #ffffff 0%, #00ff88 100%);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0 0 16px 0;
        }

        .section-subtitle {
          font-size: 18px;
          color: #b3b3b3;
          margin: 0;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Screenshots Grid */
        .screenshots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 24px;
          margin-top: 48px;
        }

        .screenshot-card {
          background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #333;
          transition: all 0.3s;
        }

        .screenshot-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          border-color: #00ff88;
        }

        .screenshot-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .screenshot-info {
          flex: 1;
        }

        .screenshot-title {
          font-size: 18px;
          font-weight: 600;
          color: white;
          margin: 0 0 8px 0;
          line-height: 1.3;
        }

        .screenshot-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }

        .file-size {
          color: #888;
          font-size: 14px;
        }

        .status-indicator {
          font-size: 14px;
          font-weight: 500;
        }

        .timestamp {
          color: #888;
          font-size: 14px;
        }

        .screenshot-analysis {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.2);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          color: #e6e6e6;
          line-height: 1.5;
          font-size: 14px;
        }

        .screenshot-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .action-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid #444;
          color: white;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .action-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .expand-btn {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: black;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          margin-left: auto;
        }

        .expand-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          max-width: 800px;
          margin: 0 auto;
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 24px;
        }

        .empty-state h3 {
          font-size: 24px;
          color: white;
          margin: 0 0 12px 0;
        }

        .empty-state p {
          color: #888;
          font-size: 16px;
          margin: 0 0 32px 0;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
          margin-top: 32px;
        }

        .feature-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          border: 1px solid #333;
        }

        .feature-icon {
          font-size: 32px;
          margin-bottom: 12px;
        }

        .feature-item h4 {
          color: white;
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .feature-item p {
          color: #888;
          margin: 0;
          font-size: 14px;
        }

        /* Settings */
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
          margin-top: 32px;
        }

        .settings-card {
          background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #333;
          transition: all 0.3s;
        }

        .settings-card:hover {
          transform: translateY(-2px);
          border-color: #00ff88;
        }

        .settings-card h3 {
          color: white;
          margin: 0 0 8px 0;
          font-size: 18px;
        }

        .settings-card p {
          color: #888;
          margin: 0 0 16px 0;
          font-size: 14px;
        }

        .settings-btn {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: black;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .settings-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
        }
      `}</style>
    </div>
  );
}

export default App;