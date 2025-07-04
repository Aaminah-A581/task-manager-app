import React, { useState, useEffect, useMemo } from 'react';
import { Plus, CheckCircle, Circle, Calendar, AlertCircle, Home, Briefcase, User, Download, Trash2, Cloud, Play, Pause, Clock } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where 
} from 'firebase/firestore';
import { auth, db } from './firebase';
import Auth from './components/Auth';
import './TaskManager.css';

const TaskManager = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('current');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    area: 'Home',
    priority: 'medium',
    deadline: '',
    completed: false
  });

  // Enhanced features state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState(['all']);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timeSpent, setTimeSpent] = useState({});

  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen for real-time task updates from Firestore
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    setSyncing(true);
    
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const tasksData = [];
      snapshot.forEach((doc) => {
        tasksData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort in JavaScript instead of Firebase
      tasksData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setTasks(tasksData);
      setSyncing(false);
    }, (error) => {
      console.error('Error fetching tasks:', error);
      setSyncing(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Timer management effects
  useEffect(() => {
    let interval;
    if (activeTimer) {
      interval = setInterval(() => {
        const elapsed = new Date() - activeTimer.startTime;
        const remaining = Math.max(0, activeTimer.duration - elapsed);
        
        if (remaining === 0) {
          stopTimer(activeTimer.taskId);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🍅 Pomodoro Complete!', {
              body: 'Great work! Time for a break.',
              icon: '/favicon.ico'
            });
          }
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const areas = [
    { name: 'Home', icon: Home, color: '#3B82F6' },
    { name: 'Work', icon: Briefcase, color: '#10B981' },
    { name: 'Self', icon: User, color: '#8B5CF6' }
  ];

  const getTaskStatus = (task) => {
    if (task.completed) return 'done';
    
    const areaTasks = tasks.filter(t => t.area === task.area && !t.completed);
    const sortedAreaTasks = [...areaTasks].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(a.deadline) - new Date(b.deadline);
    });
    
    const top3Ids = sortedAreaTasks.slice(0, 3).map(t => t.id);
    return top3Ids.includes(task.id) ? 'current' : 'pending';
  };

  // Enhanced filtering with search and filters
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => {
      // Search functionality
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          task.area.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Filter functionality
      if (activeFilters.length > 0 && !activeFilters.includes('all')) {
        const matchesFilter = activeFilters.some(filter => {
          switch (filter) {
            case 'high': 
              return task.priority === 'high';
            case 'overdue': 
              return new Date(task.deadline) < new Date() && !task.completed;
            case 'today': 
              return new Date(task.deadline).toDateString() === new Date().toDateString();
            default: 
              return true;
          }
        });
        if (!matchesFilter) return false;
      }
      
      // Existing view mode logic
      const status = getTaskStatus(task);
      return viewMode === 'current' ? status === 'current' && !task.completed :
             viewMode === 'pending' ? status === 'pending' && !task.completed :
             viewMode === 'done' ? task.completed : false;
    });

    // Sort tasks
    filtered.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(a.deadline) - new Date(b.deadline);
    });

    return filtered;
  }, [tasks, viewMode, getTaskStatus, searchQuery, activeFilters]);

  const getTasksByArea = (area) => {
    const areaTasks = filteredTasks.filter(task => task.area === area);
    return viewMode === 'current' ? areaTasks.slice(0, 3) : areaTasks;
  };

  // Enhanced timer functions with better debugging
  const formatTime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const startTimer = (taskId) => {
    console.log('🚀 Starting timer for task:', taskId);
    
    // Stop any existing timer
    if (activeTimer) {
      stopTimer(activeTimer.taskId);
    }
    
    // Find the task
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('❌ Task not found:', taskId);
      return;
    }
    
    // Set new timer
    const newTimer = {
      taskId,
      startTime: new Date(),
      duration: 25 * 60 * 1000 // 25 minutes
    };
    
    setActiveTimer(newTimer);
    console.log('✅ Timer started:', newTimer);
    
    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🍅 Timer Started!', {
        body: `Working on: ${task.title}`,
        icon: '/favicon.ico'
      });
    } else {
      alert(`⏰ Timer started for: ${task.title}`);
    }
  };

  const stopTimer = (taskId) => {
    console.log('⏹️ Stopping timer for task:', taskId);
    
    if (!activeTimer || activeTimer.taskId !== taskId) {
      console.error('❌ No active timer for task:', taskId);
      return;
    }
    
    // Calculate time elapsed
    const timeElapsed = new Date() - activeTimer.startTime;
    console.log('⏱️ Time elapsed:', timeElapsed, 'ms');
    
    // Update time spent
    setTimeSpent(prev => {
      const newTimeSpent = {
        ...prev,
        [taskId]: (prev[taskId] || 0) + timeElapsed
      };
      console.log('💾 Updated timeSpent:', newTimeSpent);
      return newTimeSpent;
    });
    
    // Clear timer
    setActiveTimer(null);
    console.log('✅ Timer stopped');
    
    // Show notification
    const minutes = Math.round(timeElapsed / (1000 * 60));
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Timer Stopped!', {
        body: `Time recorded: ${minutes} minutes`,
        icon: '/favicon.ico'
      });
    } else {
      alert(`⏰ Timer stopped! Time recorded: ${minutes} minutes`);
    }
  };

  // Bulk operations
  const handleBulkComplete = async (taskIds) => {
    setSyncing(true);
    try {
      const promises = taskIds.map(id => {
        const taskRef = doc(db, 'tasks', id);
        return updateDoc(taskRef, {
          completed: true,
          completedAt: new Date().toISOString()
        });
      });
      await Promise.all(promises);
      setSelectedTasks([]);
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('✅ Bulk Complete Success!', {
          body: `Completed ${taskIds.length} tasks`,
          icon: '/favicon.ico'
        });
      }
    } catch (error) {
      console.error('Error bulk completing tasks:', error);
      alert('Error completing tasks. Please try again.');
    }
    setSyncing(false);
  };

  const handleBulkDelete = async (taskIds) => {
    if (!window.confirm(`Delete ${taskIds.length} selected tasks? This cannot be undone.`)) {
      return;
    }
    
    setSyncing(true);
    try {
      const promises = taskIds.map(id => deleteDoc(doc(db, 'tasks', id)));
      await Promise.all(promises);
      setSelectedTasks([]);
      
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🗑️ Bulk Delete Success!', {
          body: `Deleted ${taskIds.length} tasks`,
          icon: '/favicon.ico'
        });
      }
    } catch (error) {
      console.error('Error bulk deleting tasks:', error);
      alert('Error deleting tasks. Please try again.');
    }
    setSyncing(false);
  };

  const handleBulkExport = (taskIds) => {
    const selectedTasksData = tasks.filter(task => taskIds.includes(task.id));
    
    const csvHeaders = [
      'ID', 'Title', 'Description', 'Area', 'Priority', 'Deadline', 
      'Status', 'Completed', 'Created At', 'TAT'
    ];

    const csvData = selectedTasksData.map(task => {
      const status = task.completed ? 'Done' : getTaskStatus(task) === 'current' ? 'Current' : 'Pending';
      const tat = task.completed ? calculateTAT(task) || 'N/A' : 'N/A';
      
      return [
        task.id,
        `"${task.title}"`,
        `"${task.description}"`,
        task.area,
        task.priority,
        task.deadline,
        status,
        task.completed ? 'Yes' : 'No',
        new Date(task.createdAt).toLocaleDateString(),
        tat
      ];
    });

    const csvContent = [csvHeaders.join(','), ...csvData.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `selected-tasks-${user.email}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📊 Export Complete!', {
        body: `Exported ${taskIds.length} selected tasks`,
        icon: '/favicon.ico'
      });
    }
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.deadline || !user) return;

    setSyncing(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        ...newTask,
        userId: user.uid,
        completed: false,
        createdAt: new Date().toISOString()
      });

      setNewTask({
        title: '',
        description: '',
        area: 'Home',
        priority: 'medium',
        deadline: '',
        completed: false
      });
      setShowAddForm(false);
      
      alert('✅ Task added successfully!');
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Error adding task. Please try again.');
    }
    setSyncing(false);
  };

  // Enhanced toggle function
  const toggleTask = async (taskId) => {
    console.log('🔄 Toggling task:', taskId);
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('❌ Task not found:', taskId);
      return;
    }

    console.log('📋 Current task state:', { id: taskId, completed: task.completed });

    setSyncing(true);
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const updatedData = { 
        completed: !task.completed 
      };

      if (!task.completed) {
        updatedData.completedAt = new Date().toISOString();
        console.log('✅ Marking task as completed');
      } else {
        updatedData.completedAt = null;
        console.log('🔄 Marking task as incomplete');
      }

      await updateDoc(taskRef, updatedData);
      console.log('💾 Task updated successfully');
      
    } catch (error) {
      console.error('❌ Error updating task:', error);
      alert('Error updating task. Please try again.');
    }
    setSyncing(false);
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    setSyncing(true);
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Error deleting task. Please try again.');
    }
    setSyncing(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getDaysUntilDeadline = (deadline) => {
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `${diffDays} days left`;
  };

  const calculateTAT = (task) => {
    if (!task.completed || !task.completedAt) return null;
    
    const createdDate = new Date(task.createdAt);
    const completedDate = new Date(task.completedAt);
    const diffTime = completedDate - createdDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));
    
    if (diffDays > 1) {
      return `${diffDays} days`;
    } else if (diffHours > 1) {
      return `${diffHours} hours`;
    } else if (diffMinutes > 1) {
      return `${diffMinutes} minutes`;
    } else {
      return 'Just now';
    }
  };

  const getAverageTAT = () => {
    const completedTasks = tasks.filter(task => task.completed && task.completedAt);
    if (completedTasks.length === 0) return 'N/A';
    
    const totalTime = completedTasks.reduce((sum, task) => {
      const createdDate = new Date(task.createdAt);
      const completedDate = new Date(task.completedAt);
      return sum + (completedDate - createdDate);
    }, 0);
    
    const avgTime = totalTime / completedTasks.length;
    const avgDays = Math.ceil(avgTime / (1000 * 60 * 60 * 24));
    const avgHours = Math.ceil(avgTime / (1000 * 60 * 60));
    
    if (avgDays > 1) {
      return `${avgDays} days`;
    } else if (avgHours > 1) {
      return `${avgHours} hours`;
    } else {
      return 'Less than 1 hour';
    }
  };

  const exportToCSV = () => {
    const csvHeaders = [
      'ID', 'Title', 'Description', 'Area', 'Priority', 'Deadline', 'Status', 'Completed', 'Created At', 'Completed At', 'TAT', 'Days Until Deadline'
    ];

    const csvData = tasks.map(task => {
      const status = task.completed ? 'Done' : getTaskStatus(task) === 'current' ? 'Current' : 'Pending';
      const daysUntil = task.completed ? 'N/A' : getDaysUntilDeadline(task.deadline);
      const tat = task.completed ? calculateTAT(task) || 'N/A' : 'N/A';
      const completedAt = task.completed && task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'N/A';
      
      return [
        task.id,
        `"${task.title}"`,
        `"${task.description}"`,
        task.area,
        task.priority,
        task.deadline,
        status,
        task.completed ? 'Yes' : 'No',
        new Date(task.createdAt).toLocaleDateString(),
        completedAt,
        tat,
        `"${daysUntil}"`
      ];
    });

    const csvContent = [csvHeaders.join(','), ...csvData.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tasks_export_${user.email}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearAllTasks = async () => {
    if (!window.confirm('Are you sure you want to delete ALL your tasks? This cannot be undone.')) {
      return;
    }

    setSyncing(true);
    try {
      const deletions = tasks.map(task => deleteDoc(doc(db, 'tasks', task.id)));
      await Promise.all(deletions);
    } catch (error) {
      console.error('Error clearing tasks:', error);
      alert('Error clearing tasks. Please try again.');
    }
    setSyncing(false);
  };

  // Debug functions
  console.log('Current activeTimer:', activeTimer);
  console.log('Current timeSpent:', timeSpent);
  console.log('Current tasks:', tasks.length);

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="app-container">
        <div className="app-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              border: '4px solid #f3f4f6', 
              borderTop: '4px solid #3b82f6', 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }}></div>
            <p>Loading your tasks...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show authentication if not logged in
  if (!user) {
    return <Auth user={user} />;
  }

  // Main app (authenticated users only)
  return (
    <div className="app-container">
      <div className="app-content">
        {/* Auth Component */}
        <Auth user={user} />

        {/* Enhanced Header with Fixed Layout */}
        <div style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: '20px',
          padding: '32px',
          marginBottom: '32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 'auto'
        }}>
          {/* Subtle gradient overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.03) 0%, rgba(118, 75, 162, 0.03) 100%)',
            pointerEvents: 'none'
          }}></div>

          {/* Title Section */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '25px',
            position: 'relative',
            zIndex: 2,
            flexWrap: 'wrap',
            gap: '15px'
          }}>
            <h1 style={{ 
              fontSize: '2.2rem',
              fontWeight: '700',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              color: '#1f2937',
              flexShrink: 0
            }}>
              ✨ Task Manager
              <Cloud 
                style={{ 
                  width: '28px', 
                  height: '28px',
                  color: syncing ? '#667eea' : '#10b981'
                }}
              />
            </h1>
            {syncing && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                color: '#667eea', 
                fontSize: '14px',
                fontWeight: '600'
              }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  border: '2px solid #667eea', 
                  borderTop: '2px solid transparent', 
                  borderRadius: '50%', 
                  animation: 'spin 1s linear infinite',
                  marginRight: '8px'
                }}></div>
                Syncing...
              </div>
            )}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', marginBottom: '20px', zIndex: 2 }}>
            <input
              type="text"
              placeholder="🔍 Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '16px 20px 16px 50px',
                border: '2px solid #e5e7eb',
                borderRadius: '16px',
                background: '#f9fafb',
                color: '#374151',
                fontSize: '16px',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
                e.target.style.background = 'white';
                e.target.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.background = '#f9fafb';
                e.target.style.boxShadow = 'none';
              }}
            />
            <span style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af',
              pointerEvents: 'none',
              fontSize: '18px'
            }}>
              🔍
            </span>
          </div>

          {/* Filter Tags */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', zIndex: 2, position: 'relative' }}>
            {[
              { key: 'all', label: 'All Tasks', emoji: '📋' },
              { key: 'high', label: 'High Priority', emoji: '🔥' },
              { key: 'overdue', label: 'Overdue', emoji: '⚠️' },
              { key: 'today', label: 'Due Today', emoji: '📅' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => {
                  if (filter.key === 'all') {
                    setActiveFilters(['all']);
                  } else {
                    const newFilters = activeFilters.includes(filter.key)
                      ? activeFilters.filter(f => f !== filter.key)
                      : [...activeFilters.filter(f => f !== 'all'), filter.key];
                    setActiveFilters(newFilters.length === 0 ? ['all'] : newFilters);
                  }
                }}
                style={{
                  padding: '8px 16px',
                  background: activeFilters.includes(filter.key) 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                    : '#f3f4f6',
                  border: activeFilters.includes(filter.key) ? 'none' : '1px solid #d1d5db',
                  borderRadius: '20px',
                  color: activeFilters.includes(filter.key) ? 'white' : '#374151',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
              >
                {filter.emoji} {filter.label}
              </button>
            ))}
          </div>
          
          {/* View Toggle */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '25px',
            background: '#f3f4f6',
            padding: '6px',
            borderRadius: '12px',
            position: 'relative',
            zIndex: 2,
            flexWrap: 'wrap'
          }}>
            {[
              { key: 'current', label: 'Current', icon: Circle },
              { key: 'pending', label: 'Pending', icon: AlertCircle },
              { key: 'done', label: 'Completed', icon: CheckCircle }
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  background: viewMode === key 
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                    : 'transparent',
                  color: viewMode === key ? 'white' : '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  flex: '1',
                  justifyContent: 'center',
                  minWidth: '100px'
                }}
              >
                <Icon style={{ width: '14px', height: '14px' }} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Bulk Actions Bar */}
          {selectedTasks.length > 0 && (
            <div style={{
              marginBottom: '25px',
              padding: '15px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              borderRadius: '12px',
              border: '1px solid #bae6fd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'relative',
              zIndex: 2,
              animation: 'slideDown 0.3s ease',
              flexWrap: 'wrap',
              gap: '15px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#0369a1', fontWeight: '600' }}>
                  {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => setSelectedTasks([])}
                  style={{
                    background: 'rgba(3, 105, 161, 0.1)',
                    border: 'none',
                    color: '#0369a1',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  Clear
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleBulkComplete(selectedTasks)}
                  disabled={syncing}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckCircle style={{ width: '14px', height: '14px' }} />
                  Complete
                </button>

                <button
                  onClick={() => handleBulkExport(selectedTasks)}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download style={{ width: '14px', height: '14px' }} />
                  Export
                </button>

                <button
                  onClick={() => handleBulkDelete(selectedTasks)}
                  disabled={syncing}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 style={{ width: '14px', height: '14px' }} />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons - Fixed Grid Layout */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
            position: 'relative',
            zIndex: 2
          }}>
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '50px'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              <Plus style={{ width: '18px', height: '18px' }} />
              <span>Add Task</span>
            </button>
            
            <button
              onClick={exportToCSV}
              disabled={tasks.length === 0}
              style={{
                padding: '14px 20px',
                background: tasks.length === 0 
                  ? '#d1d5db' 
                  : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                cursor: tasks.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '50px',
                opacity: tasks.length === 0 ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (tasks.length > 0) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (tasks.length > 0) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              <Download style={{ width: '18px', height: '18px' }} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={clearAllTasks}
              disabled={tasks.length === 0}
              style={{
                padding: '14px 20px',
                background: tasks.length === 0 
                  ? '#d1d5db' 
                  : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                cursor: tasks.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '50px',
                opacity: tasks.length === 0 ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (tasks.length > 0) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 20px rgba(239, 68, 68, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (tasks.length > 0) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              <Trash2 style={{ width: '18px', height: '18px' }} />
              <span>Clear All</span>
            </button>
          </div>

          {/* Task count info */}
          <div style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.85rem',
            fontWeight: '500'
          }}>
            {tasks.length === 0 ? (
              <span>📝 No tasks yet - click "Add Task" to get started!</span>
            ) : (
              <span>📊 {tasks.length} total task{tasks.length !== 1 ? 's' : ''} • {tasks.filter(t => t.completed).length} completed</span>
            )}
          </div>
        </div>

        {/* Enhanced Add Task Form */}
        {showAddForm && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(5px)'
          }}>
            <div style={{
              background: 'white',
              borderRadius: '20px',
              padding: '30px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              animation: 'modalSlideIn 0.3s ease'
            }}>
              <h2 style={{ 
                fontSize: '1.5rem', 
                fontWeight: '700', 
                marginBottom: '25px', 
                color: '#333', 
                textAlign: 'center' 
              }}>
                ✨ Add New Task
              </h2>
              
              {/* Form Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Task Title */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    color: '#374151', 
                    marginBottom: '8px' 
                  }}>
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter task title"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      transition: 'all 0.3s ease',
                      background: '#f9fafb'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.background = 'white';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#f9fafb';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  {!newTask.title && (
                    <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '4px' }}>
                      ⚠️ Task title is required
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    color: '#374151', 
                    marginBottom: '8px' 
                  }}>
                    Description
                  </label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter task description"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      transition: 'all 0.3s ease',
                      background: '#f9fafb',
                      resize: 'vertical'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.background = 'white';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#f9fafb';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* Area */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    color: '#374151', 
                    marginBottom: '8px' 
                  }}>
                    Area
                  </label>
                  <select
                    value={newTask.area}
                    onChange={(e) => setNewTask(prev => ({ ...prev, area: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      transition: 'all 0.3s ease',
                      background: '#f9fafb'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.background = 'white';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#f9fafb';
                    }}
                  >
                    {areas.map(area => (
                      <option key={area.name} value={area.name}>{area.name}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    color: '#374151', 
                    marginBottom: '8px' 
                  }}>
                    Priority
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      transition: 'all 0.3s ease',
                      background: '#f9fafb'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.background = 'white';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#f9fafb';
                    }}
                  >
                    <option value="high">🔥 High</option>
                    <option value="medium">⚡ Medium</option>
                    <option value="low">🟢 Low</option>
                  </select>
                </div>

                {/* Deadline */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.9rem', 
                    fontWeight: '600', 
                    color: '#374151', 
                    marginBottom: '8px' 
                  }}>
                    Deadline *
                  </label>
                  <input
                    type="date"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask(prev => ({ ...prev, deadline: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      transition: 'all 0.3s ease',
                      background: '#f9fafb'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      e.target.style.background = 'white';
                      e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.background = '#f9fafb';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  {!newTask.deadline && (
                    <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '4px' }}>
                      ⚠️ Deadline is required
                    </p>
                  )}
                </div>
              </div>

              {/* Modal Actions - FIXED BUTTONS */}
              <div style={{
                display: 'flex',
                gap: '15px',
                marginTop: '30px'
              }}>
                <button
                  onClick={addTask}
                  disabled={!newTask.title || !newTask.deadline || syncing}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: (!newTask.title || !newTask.deadline || syncing)
                      ? '#d1d5db' 
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    cursor: (!newTask.title || !newTask.deadline || syncing) ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: (!newTask.title || !newTask.deadline || syncing) ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (newTask.title && newTask.deadline && !syncing) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 10px 25px rgba(102, 126, 234, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (newTask.title && newTask.deadline && !syncing) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                >
                  {syncing ? (
                    <>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid white',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus style={{ width: '18px', height: '18px' }} />
                      Add Task
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowAddForm(false)}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: '#e5e7eb',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#d1d5db';
                    e.target.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#e5e7eb';
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  Cancel
                </button>
              </div>

              {/* Help text */}
              <div style={{
                marginTop: '15px',
                textAlign: 'center',
                fontSize: '0.8rem',
                color: '#6b7280'
              }}>
                💡 Fill in the title and deadline to enable the Add Task button
              </div>
            </div>
          </div>
        )}

        {/* Task Areas */}
        <div className="task-areas">
          {areas.map(area => {
            const areaTasks = getTasksByArea(area.name);
            const Icon = area.icon;
            
            return (
              <div key={area.name} className="area-card">
                <div className="area-header" style={{ backgroundColor: area.color }}>
                  <div className="area-title">
                    <Icon style={{ width: '24px', height: '24px' }} />
                    <h2>{area.name}</h2>
                  </div>
                  <p className="area-count">
                    {areaTasks.length} {viewMode} task{areaTasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div className="task-list">
                  {areaTasks.length === 0 ? (
                    <p className="empty-state">No {viewMode} tasks</p>
                  ) : (
                    areaTasks.map(task => (
                      <div
                        key={task.id}
                        style={{
                          background: task.completed ? '#f0f9ff' : '#ffffff',
                          borderRadius: '15px',
                          padding: '20px',
                          marginBottom: '15px',
                          transition: 'all 0.3s ease',
                          border: `2px solid ${
                            task.priority === 'high' ? '#ef4444' : 
                            task.priority === 'medium' ? '#f59e0b' : '#10b981'
                          }`,
                          borderLeftWidth: '6px',
                          boxShadow: task.completed ? 'none' : '0 4px 12px rgba(0,0,0,0.1)',
                          opacity: task.completed ? 0.8 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
                          {/* Selection checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedTasks.includes(task.id)}
                            onChange={(e) => {
                              console.log('Checkbox clicked for task:', task.id);
                              if (e.target.checked) {
                                setSelectedTasks(prev => [...prev, task.id]);
                              } else {
                                setSelectedTasks(prev => prev.filter(id => id !== task.id));
                              }
                            }}
                            style={{
                              width: '18px',
                              height: '18px',
                              marginTop: '2px',
                              cursor: 'pointer',
                              accentColor: '#667eea'
                            }}
                          />

                          {/* Task completion toggle - ENHANCED */}
                          <button
                            onClick={() => {
                              console.log('Toggle clicked for task:', task.id);
                              toggleTask(task.id);
                            }}
                            disabled={syncing}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              border: task.completed ? 'none' : '3px solid #e5e7eb',
                              background: task.completed 
                                ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                                : '#ffffff',
                              cursor: syncing ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.3s ease',
                              boxShadow: task.completed ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 2px 6px rgba(0,0,0,0.1)',
                              flexShrink: 0
                            }}
                            onMouseEnter={(e) => {
                              if (!syncing) {
                                e.target.style.transform = 'scale(1.1)';
                                e.target.style.borderColor = task.completed ? '#10b981' : '#667eea';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!syncing) {
                                e.target.style.transform = 'scale(1)';
                                e.target.style.borderColor = task.completed ? '#10b981' : '#e5e7eb';
                              }
                            }}
                          >
                            {task.completed ? (
                              <CheckCircle style={{ width: '20px', height: '20px', color: 'white' }} />
                            ) : (
                              <Circle style={{ width: '18px', height: '18px', color: '#9ca3af' }} />
                            )}
                          </button>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Task title and description */}
                            <h3 style={{
                              fontSize: '1.1rem',
                              fontWeight: '600',
                              marginBottom: '8px',
                              color: task.completed ? '#6b7280' : '#1f2937',
                              textDecoration: task.completed ? 'line-through' : 'none'
                            }}>
                              {task.title}
                            </h3>
                            
                            {task.description && (
                              <p style={{
                                color: task.completed ? '#9ca3af' : '#6b7280',
                                marginBottom: '12px',
                                fontSize: '0.9rem',
                                lineHeight: '1.4'
                              }}>
                                {task.description}
                              </p>
                            )}
                            
                            {/* Task meta information */}
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '12px', 
                              marginBottom: '12px',
                              flexWrap: 'wrap'
                            }}>
                              <span style={{
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                textTransform: 'uppercase',
                                background: task.priority === 'high' ? '#fee2e2' : 
                                           task.priority === 'medium' ? '#fef3c7' : '#dcfce7',
                                color: task.priority === 'high' ? '#dc2626' : 
                                       task.priority === 'medium' ? '#d97706' : '#16a34a'
                              }}>
                                {task.priority}
                              </span>
                              
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                color: '#6b7280',
                                fontSize: '0.85rem'
                              }}>
                                <Calendar style={{ width: '14px', height: '14px' }} />
                                <span>{formatDate(task.deadline)}</span>
                              </div>
                            </div>

                            {/* Timer Section - FIXED */}
                            {!task.completed && (
                              <div style={{ 
                                marginTop: '12px', 
                                padding: '12px 16px',
                                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                                borderRadius: '12px',
                                border: '1px solid #bae6fd',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Clock style={{ width: '16px', height: '16px', color: '#0369a1' }} />
                                  <span style={{ 
                                    fontSize: '0.9rem', 
                                    color: '#0369a1', 
                                    fontWeight: '600' 
                                  }}>
                                    {timeSpent[task.id] ? formatTime(timeSpent[task.id]) : '0m'}
                                  </span>
                                  {activeTimer?.taskId === task.id && (
                                    <span style={{ 
                                      fontSize: '0.75rem', 
                                      color: '#dc2626',
                                      fontWeight: '700',
                                      animation: 'pulse 1s infinite',
                                      background: '#fee2e2',
                                      padding: '2px 8px',
                                      borderRadius: '10px'
                                    }}>
                                      ● ACTIVE
                                    </span>
                                  )}
                                </div>
                                
                                {/* FIXED TIMER BUTTON */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('Timer button clicked for task:', task.id);
                                    console.log('Current activeTimer:', activeTimer);
                                    
                                    if (activeTimer?.taskId === task.id) {
                                      console.log('Stopping timer');
                                      stopTimer(task.id);
                                    } else {
                                      console.log('Starting timer');
                                      startTimer(task.id);
                                    }
                                  }}
                                  disabled={syncing}
                                  style={{
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    background: activeTimer?.taskId === task.id 
                                      ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                                      : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: 'white',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    cursor: syncing ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    minWidth: '80px',
                                    justifyContent: 'center'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!syncing) {
                                      e.target.style.transform = 'translateY(-2px)';
                                      e.target.style.boxShadow = activeTimer?.taskId === task.id 
                                        ? '0 6px 20px rgba(220, 38, 38, 0.4)'
                                        : '0 6px 20px rgba(5, 150, 105, 0.4)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!syncing) {
                                      e.target.style.transform = 'translateY(0)';
                                      e.target.style.boxShadow = 'none';
                                    }
                                  }}
                                >
                                  {activeTimer?.taskId === task.id ? (
                                    <>
                                      <Pause style={{ width: '14px', height: '14px' }} />
                                      Stop
                                    </>
                                  ) : (
                                    <>
                                      <Play style={{ width: '14px', height: '14px' }} />
                                      Start
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                            
                            {/* TAT Display for completed tasks */}
                            {task.completed && task.completedAt && (
                              <div style={{
                                marginTop: '12px',
                                padding: '12px 16px',
                                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                                borderRadius: '12px',
                                border: '1px solid #86efac',
                                animation: 'fadeInUp 0.5s ease'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ 
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    color: '#15803d'
                                  }}>
                                    ✅ TAT: {calculateTAT(task)}
                                  </span>
                                  <span style={{ 
                                    fontSize: '0.75rem', 
                                    color: '#16a34a',
                                    fontStyle: 'italic'
                                  }}>
                                    (Completed: {formatDate(task.completedAt)})
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            {/* Deadline status for active tasks */}
                            {!task.completed && (
                              <div style={{ marginTop: '12px' }}>
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  color: getDaysUntilDeadline(task.deadline).includes('overdue') ? '#dc2626' :
                                         getDaysUntilDeadline(task.deadline).includes('today') ? '#d97706' : '#059669',
                                  background: getDaysUntilDeadline(task.deadline).includes('overdue') ? '#fee2e2' :
                                              getDaysUntilDeadline(task.deadline).includes('today') ? '#fef3c7' : '#dcfce7',
                                  padding: '4px 12px',
                                  borderRadius: '12px'
                                }}>
                                  {getDaysUntilDeadline(task.deadline).includes('overdue') ? '⚠️' : 
                                   getDaysUntilDeadline(task.deadline).includes('today') ? '📅' : '✅'} {getDaysUntilDeadline(task.deadline)}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Delete button for completed tasks */}
                          {viewMode === 'done' && task.completed && (
                            <button
                              onClick={() => {
                                console.log('Delete clicked for task:', task.id);
                                deleteTask(task.id);
                              }}
                              disabled={syncing}
                              style={{
                                padding: '8px',
                                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                                border: '1px solid #fca5a5',
                                borderRadius: '8px',
                                color: '#dc2626',
                                cursor: syncing ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!syncing) {
                                  e.target.style.background = 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
                                  e.target.style.color = 'white';
                                  e.target.style.transform = 'scale(1.1)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!syncing) {
                                  e.target.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
                                  e.target.style.color = '#dc2626';
                                  e.target.style.transform = 'scale(1)';
                                }
                              }}
                              title="Delete task"
                            >
                              <Trash2 style={{ width: '16px', height: '16px' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Enhanced Task Summary */}
        <div className="summary">
          <h3>📊 Productivity Dashboard</h3>
          
          {/* Progress Bar */}
          <div style={{ marginBottom: '25px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <span style={{ fontWeight: '600', color: '#374151' }}>Overall Progress</span>
              <span style={{ fontWeight: '700', color: '#667eea' }}>
                {tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '12px',
              background: '#e5e7eb',
              borderRadius: '6px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${tasks.length > 0 ? (tasks.filter(t => t.completed).length / tasks.length) * 100 : 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '6px',
                transition: 'width 0.5s ease'
              }}></div>
            </div>
          </div>

          {/* Enhanced Stats Grid */}
          <div className="summary-stats">
            <div className="stat-item">
              <div className="stat-number">{tasks.filter(t => !t.completed).length}</div>
              <div className="stat-label">Active Tasks</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-number">{tasks.filter(t => t.completed).length}</div>
              <div className="stat-label">Completed</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-number">
                {tasks.filter(t => !t.completed && getTaskStatus(t) === 'pending').length}
              </div>
              <div className="stat-label">Pending</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-number">{getAverageTAT()}</div>
              <div className="stat-label">Avg TAT</div>
            </div>
            
            <div className="stat-item" style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' }}>
              <div className="stat-number" style={{ 
                background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {tasks.filter(t => !t.completed && new Date(t.deadline) < new Date()).length}
              </div>
              <div className="stat-label">Overdue</div>
            </div>
            
            <div className="stat-item" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
              <div className="stat-number" style={{ 
                background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0}%
              </div>
              <div className="stat-label">Completion Rate</div>
            </div>
            
            <div className="stat-item" style={{ background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)' }}>
              <div className="stat-number" style={{ 
                background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {Object.values(timeSpent).length > 0 ? 
                  formatTime(Object.values(timeSpent).reduce((a, b) => a + b, 0)) : '0m'}
              </div>
              <div className="stat-label">Time Tracked</div>
            </div>
            
            <div className="stat-item" style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)' }}>
              <div className="stat-number" style={{ 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {(() => {
                  const completed = tasks.filter(t => t.completed);
                  const onTime = completed.filter(t => 
                    t.completedAt && new Date(t.completedAt) <= new Date(t.deadline)
                  );
                  return completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 100;
                })()}%
              </div>
              <div className="stat-label">On-Time Rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskManager;