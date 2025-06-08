/**
 * Resource Monitor for Batch Processing
 * 
 * This script monitors system resource usage during batch processing
 * to help analyze the effectiveness of batch processing in releasing
 * resources between batches.
 */

import os from 'os';
import { EventEmitter } from 'events';
// Use mock crawler events
import { crawlerEvents } from './mock-crawler.js';

// Resource monitoring events
const monitorEvents = new EventEmitter();

// Resource snapshot data structure
class ResourceSnapshot {
  constructor() {
    this.timestamp = Date.now();
    this.memory = process.memoryUsage();
    this.cpuUsage = process.cpuUsage();
    this.systemMemory = {
      total: os.totalmem(),
      free: os.freemem()
    };
    this.loadAverage = os.loadavg();
  }
  
  static calculateDiff(snapshot1, snapshot2) {
    const elapsedMs = snapshot2.timestamp - snapshot1.timestamp;
    
    // CPU usage calculation
    const cpuUser = snapshot2.cpuUsage.user - snapshot1.cpuUsage.user;
    const cpuSystem = snapshot2.cpuUsage.system - snapshot1.cpuUsage.system;
    const cpuTotal = cpuUser + cpuSystem;
    
    // Calculate CPU percentage (divide by elapsed microseconds)
    const cpuPercent = cpuTotal / (elapsedMs * 1000) * 100;
    
    // Memory change
    const rssChange = snapshot2.memory.rss - snapshot1.memory.rss;
    const heapTotalChange = snapshot2.memory.heapTotal - snapshot1.memory.heapTotal;
    const heapUsedChange = snapshot2.memory.heapUsed - snapshot1.memory.heapUsed;
    
    return {
      elapsedMs,
      cpu: {
        userChange: cpuUser,
        systemChange: cpuSystem,
        percentage: cpuPercent
      },
      memory: {
        rssChange: rssChange / (1024 * 1024), // MB
        heapTotalChange: heapTotalChange / (1024 * 1024), // MB
        heapUsedChange: heapUsedChange / (1024 * 1024), // MB
        rss: snapshot2.memory.rss / (1024 * 1024), // MB
        heapTotal: snapshot2.memory.heapTotal / (1024 * 1024), // MB
        heapUsed: snapshot2.memory.heapUsed / (1024 * 1024) // MB
      },
      systemMemory: {
        free: snapshot2.systemMemory.free / (1024 * 1024), // MB
        total: snapshot2.systemMemory.total / (1024 * 1024), // MB
        freePercentage: (snapshot2.systemMemory.free / snapshot2.systemMemory.total) * 100
      }
    };
  }
}

// Resource monitoring class
class ResourceMonitor {
  constructor(intervalMs = 1000) {
    this.interval = null;
    this.intervalMs = intervalMs;
    this.snapshots = [];
    this.batchMarkers = [];
    this.isMonitoring = false;
    this.setupCrawlerEventListeners();
  }
  
  setupCrawlerEventListeners() {
    // Listen for batch transitions
    crawlerEvents.on('crawlingProgress', (progress) => {
      if (progress.message && progress.message.includes('Processing batch')) {
        this.markBatchTransition(progress.message);
      }
      
      // Track when resources are being cleaned up
      if (progress.message && progress.message.includes('Cleaning up resources')) {
        this.markEvent('Resource cleanup');
      }
      
      // Track when batch delay is happening
      if (progress.message && progress.message.includes('Waiting')) {
        this.markEvent('Batch delay');
      }
    });
    
    // Track crawling start/stop
    crawlerEvents.on('crawlingStatus', (status) => {
      if (status === 'running') {
        this.start();
      } else if (status === 'completed' || status === 'error' || status === 'stopped') {
        this.stop();
        this.generateReport();
      }
    });
  }
  
  markBatchTransition(message) {
    if (!this.isMonitoring) return;
    
    this.batchMarkers.push({
      timestamp: Date.now(),
      snapshotIndex: this.snapshots.length,
      message
    });
    
    console.log(`[ResourceMonitor] Marked batch transition: ${message}`);
  }
  
  markEvent(eventName) {
    if (!this.isMonitoring) return;
    
    this.batchMarkers.push({
      timestamp: Date.now(),
      snapshotIndex: this.snapshots.length,
      message: eventName
    });
    
    console.log(`[ResourceMonitor] Marked event: ${eventName}`);
  }
  
  start() {
    if (this.isMonitoring) return;
    
    console.log('[ResourceMonitor] Starting resource monitoring');
    this.isMonitoring = true;
    this.snapshots = [];
    this.batchMarkers = [];
    
    // Add initial snapshot
    this.snapshots.push(new ResourceSnapshot());
    
    // Setup interval for regular snapshots
    this.interval = setInterval(() => {
      this.snapshots.push(new ResourceSnapshot());
      
      // Emit current stats
      if (this.snapshots.length >= 2) {
        const current = this.snapshots[this.snapshots.length - 1];
        const previous = this.snapshots[this.snapshots.length - 2];
        const diff = ResourceSnapshot.calculateDiff(previous, current);
        
        monitorEvents.emit('stats', diff);
      }
    }, this.intervalMs);
  }
  
  stop() {
    if (!this.isMonitoring) return;
    
    console.log('[ResourceMonitor] Stopping resource monitoring');
    clearInterval(this.interval);
    this.interval = null;
    this.isMonitoring = false;
    
    // Add final snapshot
    this.snapshots.push(new ResourceSnapshot());
  }
  
  generateReport() {
    if (this.snapshots.length < 2) {
      console.log('[ResourceMonitor] Not enough snapshots to generate a report');
      return;
    }
    
    console.log('\n===== Resource Monitoring Report =====');
    
    // Total monitoring duration
    const totalDuration = this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp;
    console.log(`Total monitoring duration: ${totalDuration / 1000} seconds`);
    
    // Peak memory usage
    let peakRss = 0;
    let peakHeapTotal = 0;
    let peakHeapUsed = 0;
    
    for (const snapshot of this.snapshots) {
      peakRss = Math.max(peakRss, snapshot.memory.rss);
      peakHeapTotal = Math.max(peakHeapTotal, snapshot.memory.heapTotal);
      peakHeapUsed = Math.max(peakHeapUsed, snapshot.memory.heapUsed);
    }
    
    console.log('\n----- Peak Memory Usage -----');
    console.log(`RSS: ${(peakRss / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Heap Total: ${(peakHeapTotal / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Heap Used: ${(peakHeapUsed / (1024 * 1024)).toFixed(2)} MB`);
    
    // Batch transition analysis
    if (this.batchMarkers.length > 0) {
      console.log('\n----- Batch Transition Analysis -----');
      
      // For each batch marker, show memory change after the transition
      for (let i = 0; i < this.batchMarkers.length; i++) {
        const marker = this.batchMarkers[i];
        const markerIndex = marker.snapshotIndex;
        
        // Find next snapshot after the marker
        let nextSnapshotIndex = markerIndex;
        while (nextSnapshotIndex < this.snapshots.length && 
               this.snapshots[nextSnapshotIndex].timestamp < marker.timestamp) {
          nextSnapshotIndex++;
        }
        
        // If we have a snapshot after the marker and a snapshot before the cleanup
        if (nextSnapshotIndex < this.snapshots.length && markerIndex > 0) {
          const beforeSnapshot = this.snapshots[markerIndex - 1];
          const afterSnapshot = this.snapshots[nextSnapshotIndex];
          
          // Calculate resource change
          const diff = ResourceSnapshot.calculateDiff(beforeSnapshot, afterSnapshot);
          
          console.log(`\nEvent: ${marker.message}`);
          console.log(`Time: ${new Date(marker.timestamp).toISOString()}`);
          console.log(`Memory Change: RSS ${diff.memory.rssChange.toFixed(2)} MB, Heap Used ${diff.memory.heapUsedChange.toFixed(2)} MB`);
          console.log(`Current Memory: RSS ${diff.memory.rss.toFixed(2)} MB, Heap Used ${diff.memory.heapUsed.toFixed(2)} MB`);
        }
      }
    }
    
    // Memory profile over time
    console.log('\n----- Memory Profile Over Time -----');
    const sampleInterval = Math.max(1, Math.floor(this.snapshots.length / 10));
    
    for (let i = 0; i < this.snapshots.length; i += sampleInterval) {
      const snapshot = this.snapshots[i];
      const timeOffset = (snapshot.timestamp - this.snapshots[0].timestamp) / 1000;
      
      console.log(`Time: ${timeOffset.toFixed(1)}s, RSS: ${(snapshot.memory.rss / (1024 * 1024)).toFixed(2)} MB, Heap Used: ${(snapshot.memory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
    }
    
    console.log('\n===== End of Report =====\n');
  }
}

// Create and export monitor instance
export const resourceMonitor = new ResourceMonitor();
export { monitorEvents };

// Auto-start monitoring
resourceMonitor.start();
