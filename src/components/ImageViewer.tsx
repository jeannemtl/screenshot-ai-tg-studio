// Create src/components/ImageViewer.tsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Copy, ZoomIn, ZoomOut } from 'lucide-react';

interface Screenshot {
  id: string;
  name: string;
  size: number;
  type: string;
  timestamp: string;
  status: 'processing' | 'completed' | 'error';
  analysis?: string;
  source?: string;
  imageData?: string; // base64 image data
}

interface ImageViewerProps {
  screenshot: Screenshot | null;
  isOpen: boolean;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ screenshot, isOpen, onClose }) => {
  const [zoom, setZoom] = React.useState(1);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = () => {
    if (screenshot?.imageData) {
      const link = document.createElement('a');
      link.href = `data:${screenshot.type};base64,${screenshot.imageData}`;
      link.download = screenshot.name;
      link.click();
    }
  };

  const handleCopy = async () => {
    if (screenshot?.imageData) {
      try {
        const response = await fetch(`data:${screenshot.type};base64,${screenshot.imageData}`);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        // Could add a toast notification here
        console.log('Image copied to clipboard');
      } catch (error) {
        console.error('Failed to copy image:', error);
      }
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      resetZoom();
    }
  }, [isOpen]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          resetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!screenshot) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="image-viewer-overlay"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="image-viewer-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="image-viewer-header">
              <div className="image-viewer-info">
                <h2>{screenshot.name}</h2>
                <p>{formatFileSize(screenshot.size)} • {formatTime(screenshot.timestamp)}</p>
              </div>
              <div className="image-viewer-controls">
                <button onClick={handleZoomOut} disabled={zoom <= 0.25}>
                  <ZoomOut size={20} />
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button onClick={handleZoomIn} disabled={zoom >= 3}>
                  <ZoomIn size={20} />
                </button>
                <button onClick={resetZoom}>Reset</button>
                <div className="divider" />
                <button onClick={handleCopy} title="Copy to clipboard">
                  <Copy size={20} />
                </button>
                <button onClick={handleDownload} title="Download">
                  <Download size={20} />
                </button>
                <button onClick={onClose} className="close-btn">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Image Container */}
            <div className="image-viewer-content">
              <div 
                className="image-container"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
              >
                {screenshot.imageData ? (
                  <img
                    src={`data:${screenshot.type};base64,${screenshot.imageData}`}
                    alt={screenshot.name}
                    style={{
                      transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                      transition: isDragging ? 'none' : 'transform 0.2s'
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="image-placeholder">
                    <span>📸</span>
                    <p>Image not available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Panel */}
            {screenshot.analysis && (
              <div className="image-viewer-analysis">
                <h3>AI Analysis</h3>
                <p>{screenshot.analysis}</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageViewer;