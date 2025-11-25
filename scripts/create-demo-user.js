import { Database } from '../src/database';

async function createUser() {
  const db = Database.getInstance();

  // Wait for database to initialize
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const user = await db.createUser('demo', 'password123');
    console.log('Created demo user:', user);

    // Create some example tunnels
    await db.createTunnel(user.id, 'Web Server', 8080);
    await db.createTunnel(user.id, 'Database', 5432);
    console.log('Created example tunnels');
  } catch (error) {
    console.error('Error creating user:', error);
  }
}

createUser();
