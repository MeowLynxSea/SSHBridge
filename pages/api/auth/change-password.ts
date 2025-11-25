import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database';
import bcrypt from 'bcrypt';

const database = getDatabaseInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get user from token
    const session = await database.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const user = await database.getUserById(session.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await database.updateUserPassword(user.id, hashedNewPassword);

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}