// src/components/ServerConfig.tsx

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  Settings, 
  Play, 
  Square, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle,
  Monitor,
  MessageSquare,
  ExternalLink
} from 'lucide-react';

interface ServerConfig {
  anthropic_api_key?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  enable_desktop_detection: boolean;
  server_port: number;
}

interface ServerInfo {
  status: string;
  local_ip: string;
  port: number;
  endpoint_url: string;
  desktop_detection: boolean;
  telegram_configured: boolean;
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

const ServerConfig: React.FC = () => {
  const [config, setConfig] = useState<ServerConfig>({
    anthropic_api_key: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    enable_desktop_detection: false,
    server_port: 5001,
  });

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [recentProcessing, setRecentProcessing] = useState<ProcessingResponse[]>([]);

  // Load initial config and server status
  useEffect(() => {
    loadConfig();
    checkServerStatus();

    // Listen for setup dialog trigger
    const unlisten = listen('show-setup-dialog', () => {
      setShowSetup(true);
    });

    // Check server status periodically
    const interval = setInterval(checkServerStatus, 5000);

    return () => {
      unlisten.then(fn => fn());
      clearInterval(interval);
    };
  }, []);

  const loadConfig = async () => {
    try {
      const loadedConfig = await invoke<ServerConfig>('load_env_config');
      setConfig(loadedConfig);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const checkServerStatus = async () => {
    try {
      const status = await invoke<ServerInfo | null>('get_server_status');
      setServerInfo(status);
    } catch (error) {
      console.error('Failed to get server status:', error);
      setServerInfo(null);
    }
  };

  const startServer = async () => {
    if (!config.anthropic_api_key) {
      alert('Anthropic API key is required!');
      return;
    }

    setIsLoading(true);
    try {
      const info = await invoke<ServerInfo>('start_server', { config });
      setServerInfo(info);
      setShowSetup(false);
      
      // Show success notification
      alert(`✅ Server started successfully!\n\nEndpoint: ${info.endpoint_url}\n\nSetup your iPhone Shortcut to POST screenshots to this URL.`);
    } catch (error) {
      console.error('Failed to start server:', error);
      alert(`Failed to start server: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopServer = async () => {
    setIsLoading(true);
    try {
      await invoke('stop_server');
      setServerInfo(null);
    } catch (error) {
      console.error('Failed to stop server:', error);
      alert(`Failed to stop server: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDesktopDetection = async () => {
    if (!serverInfo) return;

    try {
      const newState = !serverInfo.desktop_detection;
      await invoke('toggle_desktop_detection', { enable: newState });
      setServerInfo({ ...serverInfo, desktop_detection: newState });
    } catch (error) {
      console.error('Failed to toggle desktop detection:', error);
      alert(`Failed to toggle desktop detection: ${error}`);
    }
  };

  const testScreenshotProcessing = async () => {
    try {
      // Create a simple test image (1x1 red pixel PNG in base64)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      
      const result = await invoke<ProcessingResponse>('process_screenshot_direct', {
        imageBase64: testImageBase64,
        metadata: {
          source: 'test',
          app: 'Screenshot AI Studio',
          filename: 'test.png',
        }
      });

      setRecentProcessing(prev => [result, ...prev.slice(0, 4)]);
      
      if (result.success) {
        alert(`✅ Test successful!\n\nAnalysis: ${result.summary}`);
      } else {
        alert(`❌ Test failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Test failed:', error);
      alert(`Test failed: ${error}`);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const isServerRunning = serverInfo?.status === 'running';

  return (
    <div className="server-config">
      {/* Server Status Header */}
      <div className="status-header">
        <div className="status-info">
          <div className="status-indicator">
            <div className={`status-dot ${isServerRunning ? 'running' : 'stopped'}`} />
            <span className="status-text">
              {isServerRunning ? 'Server Running' : 'Server Stopped'}
            </span>
          </div>
          
          {serverInfo && (
            <div className="server-details">
              <div className="detail-item">
                <Wifi size={16} />
                <span>{serverInfo.local_ip}:{serverInfo.port}</span>
              </div>
              <div className="detail-item">
                <Monitor size={16} />
                <span>{serverInfo.desktop_detection ? 'Desktop ON' : 'Desktop OFF'}</span>
              </div>
              <div className="detail-item">
                <MessageSquare size={16} />
                <span>{serverInfo.telegram_configured ? 'Telegram ON' : 'Telegram OFF'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="server-controls">
          {isServerRunning ? (
            <button 
              onClick={stopServer} 
              disabled={isLoading}
              className="btn btn-danger"
            >
              <Square size={16} />
              Stop Server
            </button>
          ) : (
            <button 
              onClick={() => setShowSetup(true)} 
              className="btn btn-primary"
            >
              <Settings size={16} />
              Configure & Start
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {isServerRunning && (
        <div className="quick-actions">
          <button 
            onClick={toggleDesktopDetection}
            className={`btn ${serverInfo?.desktop_detection ? 'btn-success' : 'btn-secondary'}`}
          >
            <Monitor size={16} />
            {serverInfo?.desktop_detection ? 'Disable' : 'Enable'} Desktop Detection
          </button>
          
          <button 
            onClick={testScreenshotProcessing}
            className="btn btn-outline"
          >
            <CheckCircle size={16} />
            Test Processing
          </button>

          {serverInfo && (
            <button 
              onClick={() => navigator.clipboard.writeText(serverInfo.endpoint_url)}
              className="btn btn-outline"
            >
              <ExternalLink size={16} />
              Copy iOS Endpoint
            </button>
          )}
        </div>
      )}

      {/* Recent Processing Results */}
      {recentProcessing.length > 0 && (
        <div className="recent-processing">
          <h3>Recent Processing</h3>
          <div className="processing-list">
            {recentProcessing.map((result, index) => (
              <motion.div
                key={`${result.timestamp}-${index}`}
                className={`processing-item ${result.success ? 'success' : 'error'}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="processing-header">
                  <div className="processing-status">
                    {result.success ? (
                      <CheckCircle size={16} className="text-green" />
                    ) : (
                      <AlertCircle size={16} className="text-red" />
                    )}
                    <span>{result.source || 'Unknown'}</span>
                  </div>
                  <span className="processing-time">
                    {formatTimestamp(result.timestamp)}
                  </span>
                </div>
                {result.summary && (
                  <p className="processing-summary">{result.summary}</p>
                )}
                {result.error && (
                  <p className="processing-error">{result.error}</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Setup Modal */}
      <AnimatePresence>
        {showSetup && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSetup(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>🚀 Screenshot Server Setup</h2>
                <p>Configure your AI screenshot server to start processing images</p>
              </div>

              <div className="config-form">
                {/* Anthropic API Key */}
                <div className="form-group">
                  <label>
                    <strong>Anthropic API Key</strong> <span className="required">*</span>
                  </label>
                  <div className="input-with-toggle">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={config.anthropic_api_key || ''}
                      onChange={(e) => setConfig({...config, anthropic_api_key: e.target.value})}
                      placeholder="sk-ant-..."
                      className="form-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="toggle-password"
                    >
                      {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <small>Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></small>
                </div>

                {/* Server Port */}
                <div className="form-group">
                  <label>Server Port</label>
                  <input
                    type="number"
                    value={config.server_port}
                    onChange={(e) => setConfig({...config, server_port: parseInt(e.target.value) || 5001})}
                    className="form-input"
                    min="1024"
                    max="65535"
                  />
                </div>

                {/* Desktop Detection */}
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={config.enable_desktop_detection}
                      onChange={(e) => setConfig({...config, enable_desktop_detection: e.target.checked})}
                    />
                    <span>Enable Desktop Screenshot Auto-Detection</span>
                  </label>
                  <small>Automatically process screenshots taken on your Mac</small>
                </div>

                {/* Telegram Configuration */}
                <div className="form-section">
                  <h3>📱 Telegram Notifications (Optional)</h3>
                  
                  <div className="form-group">
                    <label>Telegram Bot Token</label>
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={config.telegram_bot_token || ''}
                      onChange={(e) => setConfig({...config, telegram_bot_token: e.target.value})}
                      placeholder="123456:ABC-DEF..."
                      className="form-input"
                    />
                    <small>Get from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a></small>
                  </div>

                  <div className="form-group">
                    <label>Telegram Chat ID</label>
                    <input
                      type="text"
                      value={config.telegram_chat_id || ''}
                      onChange={(e) => setConfig({...config, telegram_chat_id: e.target.value})}
                      placeholder="123456789"
                      className="form-input"
                    />
                    <small>Get from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer">@userinfobot</a></small>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button 
                  onClick={() => setShowSetup(false)}
                  className="btn btn-secondary"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  onClick={startServer}
                  className="btn btn-primary"
                  disabled={isLoading || !config.anthropic_api_key}
                >
                  {isLoading ? (
                    <>
                      <div className="spinner" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Start Server
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .server-config {
          padding: 24px;
          max-width: 800px;
          margin: 0 auto;
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          border: 1px solid #333;
        }

        .status-info {
          flex: 1;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .status-dot.running {
          background: #00ff88;
        }

        .status-dot.stopped {
          background: #ff4444;
        }

        .status-text {
          font-weight: 600;
          color: white;
        }

        .server-details {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        .detail-item {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #888;
          font-size: 14px;
        }

        .server-controls {
          margin-left: 16px;
        }

        .quick-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .recent-processing {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #333;
        }

        .recent-processing h3 {
          margin: 0 0 16px 0;
          color: white;
          font-size: 18px;
        }

        .processing-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .processing-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 16px;
          border-left: 4px solid;
        }

        .processing-item.success {
          border-left-color: #00ff88;
        }

        .processing-item.error {
          border-left-color: #ff4444;
        }

        .processing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .processing-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }

        .processing-time {
          color: #888;
          font-size: 14px;
        }

        .processing-summary {
          margin: 0;
          color: #ccc;
          font-size: 14px;
          line-height: 1.4;
        }

        .processing-error {
          margin: 0;
          color: #ff6666;
          font-size: 14px;
        }

        .text-green {
          color: #00ff88;
        }

        .text-red {
          color: #ff4444;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: linear-gradient(135deg, #1e1e1e, #2a2a2a);
          border-radius: 16px;
          padding: 32px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          border: 1px solid #333;
        }

        .modal-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .modal-header h2 {
          margin: 0 0 8px 0;
          color: white;
          font-size: 24px;
        }

        .modal-header p {
          margin: 0;
          color: #888;
        }

        .config-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-section {
          border-top: 1px solid #333;
          padding-top: 20px;
        }

        .form-section h3 {
          margin: 0 0 16px 0;
          color: white;
          font-size: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          color: white;
          font-weight: 500;
        }

        .required {
          color: #ff4444;
        }

        .form-input {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid #444;
          border-radius: 8px;
          padding: 12px;
          color: white;
          font-size: 14px;
        }

        .form-input:focus {
          outline: none;
          border-color: #00ff88;
          box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
        }

        .input-with-toggle {
          position: relative;
        }

        .toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #888;
          cursor: pointer;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
        }

        .form-group small {
          color: #888;
          font-size: 12px;
        }

        .form-group small a {
          color: #00ff88;
          text-decoration: none;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #333;
        }

        .btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          text-decoration: none;
          font-size: 14px;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: black;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 255, 136, 0.3);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid #444;
        }

        .btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }

        .btn-danger {
          background: linear-gradient(135deg, #ff4444, #cc3333);
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 68, 68, 0.3);
        }

        .btn-success {
          background: linear-gradient(135deg, #00ff88, #00cc6a);
          color: black;
        }

        .btn-outline {
          background: transparent;
          color: white;
          border: 1px solid #444;
        }

        .btn-outline:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ServerConfig;