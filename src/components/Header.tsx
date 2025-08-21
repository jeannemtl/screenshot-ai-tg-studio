import { Monitor, Sparkles } from 'lucide-react';

interface HeaderProps {
  screenshotCount: number;
  isProcessing: boolean;
  onTestGreet: () => void;
}

const Header: React.FC<HeaderProps> = ({ screenshotCount, isProcessing, onTestGreet }) => {
  return (
    <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Monitor className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Screenshot AI Studio
                <Sparkles className="w-5 h-5 text-yellow-400" />
              </h1>
              <p className="text-slate-400">
                AI-powered screenshot analysis • {screenshotCount} processed
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              isProcessing 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'bg-green-500/20 text-green-400'
            }`}>
              {isProcessing ? 'Processing...' : 'Ready'}
            </div>
            <button
              onClick={onTestGreet}
              className="btn-secondary text-sm"
            >
              Test
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
