import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Settings, Activity, BarChart3 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';

// Components
import DropZone from './components/DropZone';

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

function App() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);

  // Handle file uploads
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
        // Simulate processing with Tauri command
        await invoke('greet', { name: file.name });
        
        // Update with results
        setScreenshots(prev => prev.map(s => 
          s.id === screenshot.id 
            ? { 
                ...s, 
                status: 'completed', 
                analysis: `AI analysis of ${file.name}: This screenshot contains interesting visual elements and patterns that have been automatically processed and categorized.`
              }
            : s
        ));
      } catch (error) {
        console.error('Processing failed:', error);
        setScreenshots(prev => prev.map(s => 
          s.id === screenshot.id 
            ? { ...s, status: 'error', analysis: 'Processing failed' }
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

  const handleTestGreet = async () => {
    try {
      const result = await invoke('greet', { name: 'Desktop App' });
      console.log('Greet result:', result);
    } catch (error) {
      console.error('Greet failed:', error);
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
                <li><a href="#" className="active">Home</a></li>
                <li><a href="#">Search</a></li>
                <li><a href="#">Your Library</a></li>
              </ul>
            </nav>
          </div>
          <div className="nav-right">
            <span className="status-badge">
              {isProcessing ? 'Processing' : 'Ready'}
            </span>
            <button className="btn-primary">
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
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
              <div className="stat-item">
                <div className="stat-number">
                  {screenshots.length > 0 
                    ? Math.round((screenshots.filter(s => s.status === 'completed').length / screenshots.length) * 100)
                    : 0}%
                </div>
                <div className="stat-label">Success Rate</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">$12.45</div>
                <div className="stat-label">This Month</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="content">
          {/* Section Header */}
          <div className="section-header">
            <div>
              <h1 className="section-title">Good afternoon</h1>
              <p className="section-subtitle">Ready to analyze your screenshots</p>
            </div>
          </div>

          {/* Drop Zone */}
          <DropZone onFilesDropped={handleFilesDropped} />
          
          {/* Processing Status */}
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="processing-status"
            >
              <div className="processing-spinner"></div>
              <div className="processing-content">
                <div className="processing-title">
                  Processing {processingCount} screenshot{processingCount !== 1 ? 's' : ''}
                </div>
                <div className="processing-bar">
                  <div className="processing-bar-fill"></div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Recently Processed Section */}
          {screenshots.length > 0 && (
            <div>
              <div className="section-header">
                <h2 className="section-title">Recently processed</h2>
                <a href="#" className="section-subtitle">Show all</a>
              </div>

              {/* Spotify-style Grid */}
              <div className="screenshots-grid">
                <AnimatePresence>
                  {screenshots.slice(0, 12).map((screenshot) => (
                    <motion.div
                      key={screenshot.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="screenshot-card"
                    >
                      {/* Screenshot image placeholder */}
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
                          <div className={`screenshot-status ${screenshot.status}`}></div>
                          <span className="screenshot-source">AI Analysis</span>
                          <div className="screenshot-time">
                            {screenshot.status === 'processing' ? 'Processing...' : formatTime(screenshot.timestamp)}
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="empty-state-icon">📸</div>
                <h3>Start analyzing your screenshots</h3>
                <p>Drop an image above or click upload to get AI-powered insights</p>
              </motion.div>
            </div>
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
                          <div className={`screenshot-status ${screenshot.status}`}></div>
                          <span className="screenshot-source">AI Analysis</span>
                          <div className="screenshot-time">
                            {formatTime(screenshot.timestamp)}
                          </div>
                        </div>
                        
                        {screenshot.analysis && (
                          <div className="screenshot-analysis">
                            {screenshot.analysis}
                          </div>
                        )}
                        
                        <div className="screenshot-actions">
                          <button className="action-btn">📋 Copy</button>
                          <button className="action-btn">🔗 Share</button>
                          <button className="expand-btn">View</button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Helper functions
function getRandomGradient(): string {
  const gradients = [
    '#1db954, #1ed760',
    '#e22134, #ff6b35', 
    '#2196f3, #21cbf3',
    '#9c27b0, #e91e63',
    '#ff9800, #ffc107',
    '#4caf50, #8bc34a',
    '#673ab7, #9c27b0',
    '#00bcd4, #03dac6'
  ];
  return gradients[Math.floor(Math.random() * gradients.length)];
}

function getDisplayName(filename: string): string {
  // Remove extension and clean up filename
  const name = filename.replace(/\.[^/.]+$/, "");
  return name.length > 20 ? name.substring(0, 20) + "..." : name;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default App;