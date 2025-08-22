// src/App.tsx

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, BarChart3, Server, Upload, Activity } from 'lucide-react';
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
  source?: string;
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
  // In your src/App.tsx, modify the useEffect to add logging:

  // Replace the useEffect in your App.tsx with this fixed version:

useEffect(() => {
  let unlistenFunction: (() => void) | null = null;

  // Load existing screenshots
  const loadScreenshots = async () => {
    try {
      const existing = await invoke<any[]>('get_recent_screenshots');
      console.log('🔍 Loaded existing screenshots:', existing.length, existing);
      setScreenshots(existing.map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        timestamp: item.timestamp,
        status: item.status,
        analysis: item.analysis,
        source: item.source
      })));
    } catch (error) {
      console.error('Failed to load screenshots:', error);
    }
  };

  // Listen for new screenshots being processed
  const setupListener = async () => {
    const unlisten = await listen('screenshot-processed', (event) => {
      console.log('📸 Received screenshot-processed event:', event.payload);
      
      const screenshotData = event.payload as any;
      const newScreenshot: Screenshot = {
        id: screenshotData.id,
        name: screenshotData.name,
        size: screenshotData.size,
        type: screenshotData.type,
        timestamp: screenshotData.timestamp,
        status: screenshotData.status || 'completed',
        analysis: screenshotData.analysis,
        source: screenshotData.source || 'desktop_auto'
      };
      
      console.log('📸 Adding new screenshot to state:', newScreenshot);
      
      setScreenshots(prev => {
        console.log('📸 Current screenshots in setter:', prev.length);
        
        // Check for duplicates by ID to prevent adding the same screenshot twice
        const isDuplicate = prev.some(existing => existing.id === newScreenshot.id);
        if (isDuplicate) {
          console.log('🔄 Skipping duplicate screenshot with ID:', newScreenshot.id);
          return prev;
        }
        
        const updated = [newScreenshot, ...prev];
        console.log('📸 New screenshots count after add:', updated.length);
        return updated;
      });
    });

    unlistenFunction = unlisten;
    return unlisten;
  };

  const initializeApp = async () => {
    await loadScreenshots();
    await setupListener();
  };

  initializeApp();

  // Cleanup function
  return () => {
    if (unlistenFunction) {
      console.log('🧹 Cleaning up screenshot event listener');
      unlistenFunction();
    }
  };
}, []); // Empty dependency array is correct here

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
        status: 'processing',
        source: 'frontend_upload'
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

  const getDisplayName = (name: string) => {
    return name.length > 30 ? name.slice(0, 30) + '...' : name;
  };

  const getRandomGradient = () => {
    const gradients = [
      '#667eea, #764ba2',
      '#f093fb, #f5576c',
      '#4facfe, #00f2fe',
      '#43e97b, #38f9d7',
      '#fa709a, #fee140',
      '#a8edea, #fed6e3',
      '#ff9a9e, #fecfef',
      '#ffecd2, #fcb69f'
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
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

      {/* Main Container with Sidebar */}
      <div className="main-container">
        {/* Spotify-style Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Your Library</h3>
            <ul className="sidebar-links">
              <li><a href="#" className="active">Recently Processed</a></li>
              <li><a href="#">Liked Screenshots</a></li>
              <li><a href="#">Downloaded</a></li>
            </ul>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Categories</h3>
            <ul className="sidebar-links">
              <li><a href="#">Research Papers</a></li>
              <li><a href="#">Code Reviews</a></li>
              <li><a href="#">UI Designs</a></li>
              <li><a href="#">Data Visualizations</a></li>
              <li><a href="#">Meeting Notes</a></li>
              <li><a href="#">Error Logs</a></li>
              <li><a href="#">Tutorials</a></li>
              <li><a href="#">Social Media</a></li>
            </ul>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Quick Actions</h3>
            <div className="quick-actions">
              <button className="btn-secondary">
                <Upload className="w-4 h-4" />
                Upload Screenshot
              </button>
              
              <button className="btn-secondary">
                <Settings className="w-4 h-4" />
                Settings
              </button>
              
              <button 
                onClick={handleTestGreet}
                className="btn-secondary"
              >
                <Activity className="w-4 h-4" />
                Test Connection
              </button>

              <button className="btn-secondary">
                <BarChart3 className="w-4 h-4" />
                Analytics
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Quick Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-number">{screenshots.length}</div>
                <div className="stat-label">Processed</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{processingCount}</div>
                <div className="stat-label">Processing</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="content">
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
                        {screenshots.slice(0, 12).map((screenshot) => (
                          <motion.div
                            key={screenshot.id}
                            className="screenshot-card"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div 
                              className="screenshot-image"
                              style={{ 
                                background: `linear-gradient(135deg, ${getRandomGradient()})`
                              }}
                            />
                            
                            <div className="screenshot-content">
                              <div className="screenshot-header">
                                <div className="screenshot-title">{getDisplayName(screenshot.name)}</div>
                              </div>
                              
                              <div className="screenshot-meta">
                                <div 
                                  className="screenshot-status"
                                  style={{ backgroundColor: getStatusColor(screenshot.status) }}
                                />
                                <span className="file-size">{formatFileSize(screenshot.size)}</span>
                                <span className="screenshot-source">
                                  {screenshot.source || 'unknown'}
                                </span>
                                <span className="status-with-icon">
                                  {getStatusIcon(screenshot.status)} {screenshot.status}
                                </span>
                                <span className="screenshot-time">
                                  {screenshot.status === 'processing' 
                                    ? 'Processing...' 
                                    : formatTime(screenshot.timestamp)
                                  }
                                </span>
                              </div>
                              
                              {screenshot.analysis && (
                                <div className="screenshot-analysis">
                                  {screenshot.analysis}
                                </div>
                              )}
                              
                              <div className="screenshot-actions">
                                <button className="action-btn">
                                  📋 Copy
                                </button>
                                <button className="action-btn">
                                  🔗 Share
                                </button>
                                <button className="action-btn">
                                  ⭐ Save
                                </button>
                                <button className="expand-btn">View</button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Made for You Section (if no screenshots) */}
                {screenshots.length === 0 && !isProcessing && (
                  <motion.div 
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="empty-state-icon">📸</div>
                    <h3>Start analyzing your screenshots</h3>
                    <p>Drop an image above or click upload to get AI-powered insights</p>
                  </motion.div>
                )}

                {/* Recently Processed Extended Grid */}
                {screenshots.length > 12 && (
                  <div style={{ marginTop: '48px' }}>
                    <div className="section-header">
                      <h2 className="section-title">More from your library</h2>
                    </div>

                    <div className="screenshots-grid">
                      <AnimatePresence>
                        {screenshots.slice(12).map((screenshot) => (
                          <motion.div
                            key={screenshot.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="screenshot-card"
                          >
                            <div 
                              className="screenshot-image"
                              style={{ 
                                background: `linear-gradient(135deg, ${getRandomGradient()})`
                              }}
                            />
                            
                            <div className="screenshot-content">
                              <div className="screenshot-header">
                                <div className="screenshot-title">{getDisplayName(screenshot.name)}</div>
                              </div>
                              
                              <div className="screenshot-meta">
                                <div 
                                  className="screenshot-status"
                                  style={{ backgroundColor: getStatusColor(screenshot.status) }}
                                />
                                <span className="file-size">{formatFileSize(screenshot.size)}</span>
                                <span className="screenshot-source">
                                  {screenshot.source || 'unknown'}
                                </span>
                                <span className="status-with-icon">
                                  {getStatusIcon(screenshot.status)} {screenshot.status}
                                </span>
                                <span className="screenshot-time">
                                  {formatTime(screenshot.timestamp)}
                                </span>
                              </div>
                              
                              {screenshot.analysis && (
                                <div className="screenshot-analysis">
                                  {screenshot.analysis}
                                </div>
                              )}
                              
                              <div className="screenshot-actions">
                                <button className="action-btn">
                                  📋 Copy
                                </button>
                                <button className="action-btn">
                                  🔗 Share
                                </button>
                                <button className="action-btn">
                                  ⭐ Save
                                </button>
                                <button className="expand-btn">View</button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
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
      </div>
    </div>
  );
}

export default App;