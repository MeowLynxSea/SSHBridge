import { NextApiRequest, NextApiResponse } from 'next';
import getDatabaseInstance from '../../../src/database.js';

interface SettingsRequest {
  refreshInterval?: number;
  language?: string;
  theme?: 'dark' | 'light' | 'auto';
}

interface SettingsResponse {
  success: boolean;
  refreshInterval?: number;
  language?: string;
  theme?: 'dark' | 'light' | 'auto';
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SettingsResponse>) {
  try {
    // 验证JWT token并获取用户ID
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const db = getDatabaseInstance();
    const user = await db.validateSession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token',
      });
    }

    const userId = user.id;

    if (req.method === 'GET') {
      // Get current user's settings
      const settings = await db.getUserSettings(userId);

      return res.status(200).json({
        success: true,
        refreshInterval: settings.refresh_interval,
        language: settings.language,
        theme: settings.theme as 'dark' | 'light' | 'auto',
      });
    } else if (req.method === 'POST' || req.method === 'PUT') {
      const { refreshInterval, language, theme }: SettingsRequest = req.body;

      // Validate refresh interval (minimum 1 second)
      if (refreshInterval !== undefined) {
        if (typeof refreshInterval !== 'number' || refreshInterval < 1000) {
          return res.status(400).json({
            success: false,
            error: 'Refresh interval must be at least 1000ms (1 second)',
          });
        }
      }

      // Validate language
      if (language !== undefined) {
        if (
          typeof language !== 'string' ||
          !['zh', 'en', 'ja', 'ar', 'de', 'es', 'fr', 'ru'].includes(language)
        ) {
          return res.status(400).json({
            success: false,
            error: 'Language must be one of: zh, en, ja, ko',
          });
        }
      }

      // Validate theme
      if (theme !== undefined) {
        if (!['dark', 'light', 'auto'].includes(theme)) {
          return res.status(400).json({
            success: false,
            error: 'Theme must be one of: dark, light, auto',
          });
        }
      }

      // Update user's settings in database
      const success = await db.setUserSettings(userId, refreshInterval, language, theme);
      if (!success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save settings to database',
        });
      }

      // Get the updated settings
      const updatedSettings = await db.getUserSettings(userId);
      return res.status(200).json({
        success: true,
        refreshInterval: updatedSettings.refresh_interval,
        language: updatedSettings.language,
        theme: updatedSettings.theme as 'dark' | 'light' | 'auto',
      });
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
      });
    }
  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
