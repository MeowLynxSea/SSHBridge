/**
 * Test script to verify multiple TCP connections support
 * This script simulates multiple external clients connecting to the tunnel
 */

const net = require('net');
const { performance } = require('perf_hooks');

const TUNNEL_PORT = 3001; // Change this to match your tunnel port
const CONNECTION_COUNT = 100; // Test with 100 connections
const TEST_MESSAGE = 'Test message from client ';
const TEST_INTERVAL_MS = 1000; // Send message every second

let activeConnections = [];
let messagesReceived = 0;
let messagesSent = 0;
let connectionsClosed = 0;

console.log(`Starting test with ${CONNECTION_COUNT} connections to port ${TUNNEL_PORT}`);
console.log('Press Ctrl+C to stop the test');

// Create multiple connections
for (let i = 0; i < CONNECTION_COUNT; i++) {
  setTimeout(() => {
    createConnection(i);
  }, i * 50); // Stagger connections to avoid overwhelming the server
}

function createConnection(id) {
  const socket = new net.Socket();
  let connectionStart = performance.now();
  
  socket.connect({
    port: TUNNEL_PORT,
    host: 'localhost'
  }, () => {
    console.log(`Connection ${id} established`);
    activeConnections.push({ id, socket, connectionStart });
    
    // Send initial message
    socket.write(`${TEST_MESSAGE}${id}`);
    messagesSent++;
    
    // Set up periodic message sending
    const interval = setInterval(() => {
      if (socket.destroyed) {
        clearInterval(interval);
        return;
      }
      
      try {
        socket.write(`${TEST_MESSAGE}${id} at ${Date.now()}`);
        messagesSent++;
      } catch (err) {
        console.error(`Error sending data on connection ${id}:`, err.message);
        clearInterval(interval);
      }
    }, TEST_INTERVAL_MS);
    
    socket.interval = interval;
  });
  
  socket.on('data', (data) => {
    messagesReceived++;
    if (messagesReceived % 100 === 0) {
      console.log(`Received ${messagesReceived} messages total`);
    }
  });
  
  socket.on('close', () => {
    connectionsClosed++;
    clearInterval(socket.interval);
    const connectionDuration = performance.now() - connectionStart;
    console.log(`Connection ${id} closed after ${Math.round(connectionDuration)}ms`);
    
    // If all connections are closed, print statistics
    if (connectionsClosed === CONNECTION_COUNT) {
      printStatistics();
    }
  });
  
  socket.on('error', (err) => {
    console.error(`Connection ${id} error:`, err.message);
    clearInterval(socket.interval);
    connectionsClosed++;
  });
}

function printStatistics() {
  const totalConnections = activeConnections.length;
  const avgDuration = activeConnections.reduce((sum, conn) => {
    return sum + (performance.now() - conn.connectionStart);
  }, 0) / totalConnections;
  
  console.log('\n=== Test Statistics ===');
  console.log(`Total connections attempted: ${CONNECTION_COUNT}`);
  console.log(`Total messages sent: ${messagesSent}`);
  console.log(`Total messages received: ${messagesReceived}`);
  console.log(`Average connection duration: ${Math.round(avgDuration)}ms`);
  console.log(`Connections closed: ${connectionsClosed}`);
  
  process.exit(0);
}

// Handle Ctrl+C to stop test
process.on('SIGINT', () => {
  console.log('\nStopping test...');
  activeConnections.forEach(({ socket }) => {
    clearInterval(socket.interval);
    socket.destroy();
  });
  printStatistics();
});