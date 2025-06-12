import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, Filter, Grid3X3, List, RefreshCw, 
  CheckCircle, Clock, XCircle, Sliders
} from 'lucide-react';

interface VideoFilterBarProps {
  onSearch: (term: string) => void;
  onFilterChange: (filters: { status?: string[]; type?: string }) => void;
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onRefresh: () => void;
  viewMode: 'grid' | 'list';
  videoTypes: string[];
  isRefreshing: boolean;
}

export const VideoFilterBar: React.FC<VideoFilterBarProps> = ({
  onSearch,
  onFilterChange,
  onViewModeChange,
  onRefresh,
  viewMode,
  videoTypes,
  isRefreshing
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearch(value);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    onFilterChange({ 
      status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      type: type === 'all' ? undefined : type 
    });
  };

  const handleStatusToggle = (status: string) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
    
    setSelectedStatuses(newStatuses);
    onFilterChange({ 
      status: newStatuses.length > 0 ? newStatuses : undefined,
      type: selectedType === 'all' ? undefined : selectedType 
    });
  };

  const clearFilters = () => {
    setSelectedType('all');
    setSelectedStatuses([]);
    onFilterChange({});
  };

  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-200/50 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="h-4 w-4 text-gray-600" />
            <span className="text-sm text-gray-700">Filters</span>
            {(selectedStatuses.length > 0 || selectedType !== 'all') && (
              <span className="flex items-center justify-center w-5 h-5 bg-purple-600 text-white text-xs rounded-full">
                {selectedStatuses.length + (selectedType !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
          
          <div className="flex items-center space-x-1 border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              title="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-purple-100 text-purple-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-sm">Refresh</span>
          </button>
        </div>
      </div>
      
      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-gray-200 overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Status Filters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Status</h4>
                  <button
                    onClick={() => setSelectedStatuses([])}
                    className="text-xs text-purple-600 hover:text-purple-800"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'completed', label: 'Completed', icon: CheckCircle, color: 'bg-green-100 text-green-800 border-green-200' },
                    { id: 'processing', label: 'Processing', icon: Clock, color: 'bg-blue-100 text-blue-800 border-blue-200' },
                    { id: 'failed', label: 'Failed', icon: XCircle, color: 'bg-red-100 text-red-800 border-red-200' }
                  ].map(status => {
                    const isSelected = selectedStatuses.includes(status.id);
                    const StatusIcon = status.icon;
                    
                    return (
                      <button
                        key={status.id}
                        onClick={() => handleStatusToggle(status.id)}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-full border transition-colors ${
                          isSelected
                            ? status.color
                            : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        <span className="text-xs font-medium">{status.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Type Filters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Type</h4>
                  <button
                    onClick={() => handleTypeChange('all')}
                    className="text-xs text-purple-600 hover:text-purple-800"
                  >
                    Show All
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {videoTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => handleTypeChange(type)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        selectedType === type
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Active Filters Summary */}
            {(selectedStatuses.length > 0 || selectedType !== 'all') && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sliders className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">Active Filters:</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedStatuses.map(status => (
                        <span key={status} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                          Status: {status}
                        </span>
                      ))}
                      {selectedType !== 'all' && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                          Type: {selectedType}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={clearFilters}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};