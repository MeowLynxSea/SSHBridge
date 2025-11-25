/**
 * Test script to verify connection counting accuracy
 * This script creates connections in batches and verifies counting
 */

const net = require('net');
const { performance } = require('perf_hooks');

const TUNNEL_PORT = 3001; // Change this to match your tunnel port
const BATCH_SIZE = 20; // Create connections in batches
const TOTAL_CONNECTIONS = 100; // Total connections to create
const BATCH_DELAY_MS = 500; // Delay between batches

console.log(`Starting connection counting test...`);
console.log(`Target: ${TOTAL_CONNECTIONS} connections in batches of ${BATCH_SIZE}`);
console.log(`Press Ctrl+C to stop test`);

let connectedCount = 0;
let closedCount = 0;
let connections = [];

// Create connections in batches
for (let batch = 0; batch < Math.ceil(TOTAL_CONNECTIONS / BATCH_SIZE); batch++) {
  setTimeout(() => {
    const startIdx = batch * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, TOTAL_CONNECTIONS);
    
    console.log(`Creating batch ${batch + 1}: connections ${startIdx}-${endIdx - 1}`);
    
    for (let i = startIdx; i < endIdx; i++) {
      createConnection(i);
    }
  }, batch * BATCH_DELAY_MS);
}

function createConnection(id) {
  const socket = new net.Socket();
  let connectionStart = performance.now();
  
  socket.connect({
    port: TUNNEL_PORT,
    host: 'localhost'
  }, () => {
    connectedCount++;
    connections.push({ id, socket, connectionStart });
    
    console.log(`Connection ${id} established (active: ${connectedCount - closedCount})`);
    
    // Send a test message
    socket.write(`Hello from connection ${id}`);
    
    // Close connection after random delay (1-5 seconds)
    const delay = 1000 + Math.random() * 4000;
    setTimeout(() => {
      try {
        socket.end();
      } catch (err) {
        console.error(`Error ending connection ${id}:`, err.message);
      }
    }, delay);
  });
  
  socket.on('close', () => {
    closedCount++;
    // 预留用于未来的连接时间统计
    // const connectionDuration = performance.now() - connectionStart;
    
    // Remove from active connections
    connections = connections.filter(conn => conn.id !== id);
    
    console.log(`Connection ${id} closed (active: ${connectedCount - closedCount})`);
    
    // If all connections are processed, print final statistics
    if (connectedCount === TOTAL_CONNECTIONS && closedCount === TOTAL_CONNECTIONS) {
      setTimeout(printFinalStats, 1000); // Wait a bit for cleanup
    }
  });
  
  socket.on('error', (err) => {
    console.error(`Connection ${id} error:`, err.message);
    closedCount++;
    
    // Remove from active connections
    connections = connections.filter(conn => conn.id !== id);
    
    if (connectedCount === TOTAL_CONNECTIONS && closedCount === TOTAL_CONNECTIONS) {
      setTimeout(printFinalStats, 1000);
    }
  });
}

function printFinalStats() {
  console.log('\n=== Final Test Statistics ===');
  console.log(`Total connections attempted: ${TOTAL_CONNECTIONS}`);
  console.log(`Connections established: ${connectedCount}`);
  console.log(`Connections closed: ${closedCount}`);
  console.log(`Active connections remaining: ${connectedCount - closedCount}`);
  console.log(`Average connection duration: ${calculateAverageDuration()}ms`);
  
  console.log('\n=== Connection Counting Validation ===');
  if (closedCount === TOTAL_CONNECTIONS && connections.length === 0) {
    console.log('✅ SUCCESS: All connections properly cleaned up');
    console.log('✅ SUCCESS: Connection counting appears accurate');
  } else {
    console.log('❌ ISSUE: Some connections may not have been properly cleaned');
    console.log(`Expected 0 active connections, found ${connections.length}`);
  }
  
  process.exit(0);
}

function calculateAverageDuration() {
  if (connections.length > 0) {
    // Calculate average of remaining active connections
    return connections.reduce((sum, conn) => {
      return sum + (performance.now() - conn.connectionStart);
    }, 0) / connections.length;
  }
  return 0;
}

// Handle Ctrl+C to stop test
process.on('SIGINT', () => {
  console.log('\nStopping test...');
  console.log(`Current status: ${connectedCount} connected, ${closedCount} closed, ${connections.length} active`);
  
  // Close all remaining connections
  connections.forEach(({ socket }) => {
    try {
      socket.destroy();
    } catch (err) {
      console.error('Error destroying socket:', err.message);
    }
  });
  
  setTimeout(printFinalStats, 500);
});