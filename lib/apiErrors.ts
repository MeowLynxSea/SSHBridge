import { NextApiRequest, NextApiResponse } from 'next';

// 错误消息类型定义
interface ErrorMessages {
  methodNotAllowed: string;
  unauthorized: string;
  invalidToken: string;
  authRequired: string;
  invalidSession: string;
  userNotFound: string;
  otpAlreadyEnabled: string;
  otpNotEnabled: string;
  otpNotEnabledForAccount: string;
  otpSecretNotFound: string;
  otpTokenRequired: string;
  otpTokenRequiredToDisable: string;
  invalidOtpToken: string;
  secretAndOtpRequired: string;
  failedToEnableOtp: string;
  failedToDisableOtp: string;
  internalServerError: string;
  invalidCredentials: string;
  usernameExists: string;
  currentPasswordIncorrect: string;
  passwordMismatch: string;
  passwordTooShort: string;
  currentPasswordRequired: string;
  newPasswordRequired: string;
  tunnelNotFound: string;
  invalidTunnelId: string;
  nameAndPortRequired: string;
  portMustBeNumber: string;
  portOutOfRange: string;
  bandwidthMustBePositive: string;
  bandwidthRequiredForPatch: string;
  portInUse: string;
}

// 英文错误消息
const enErrors: ErrorMessages = {
  methodNotAllowed: 'Method not allowed',
  unauthorized: 'Unauthorized',
  invalidToken: 'Invalid token',
  authRequired: 'Authentication required',
  invalidSession: 'Invalid session',
  userNotFound: 'User not found',
  otpAlreadyEnabled: 'OTP is already enabled',
  otpNotEnabled: 'OTP is not enabled',
  otpNotEnabledForAccount: 'OTP is not enabled for this account',
  otpSecretNotFound: 'OTP secret not found',
  otpTokenRequired: 'OTP token is required',
  otpTokenRequiredToDisable: 'OTP token is required to disable 2FA',
  invalidOtpToken: 'Invalid OTP token',
  secretAndOtpRequired: 'Secret and OTP token are required',
  failedToEnableOtp: 'Failed to enable OTP',
  failedToDisableOtp: 'Failed to disable OTP',
  internalServerError: 'Internal server error',
  invalidCredentials: 'Invalid username or password',
  usernameExists: 'Username already exists',
  currentPasswordIncorrect: 'Current password is incorrect',
  passwordMismatch: 'New password and confirm password do not match',
  passwordTooShort: 'New password must be at least 6 characters long',
  currentPasswordRequired: 'Current password and new password are required',
  newPasswordRequired: 'New password must be at least 6 characters long',
  tunnelNotFound: 'Tunnel not found',
  invalidTunnelId: 'Invalid tunnel ID',
  nameAndPortRequired: 'Name and external_port are required',
  portMustBeNumber: 'External port must be a number',
  portOutOfRange: 'External port must be in range 10000-65535',
  bandwidthMustBePositive: 'Max bandwidth must be a positive number (bytes per second)',
  bandwidthRequiredForPatch: 'Max bandwidth is required for PATCH operation',
  portInUse: 'Port is already in use',
};

// 中文错误消息
const zhErrors: ErrorMessages = {
  methodNotAllowed: '不允许的请求方法',
  unauthorized: '未授权',
  invalidToken: '无效令牌',
  authRequired: '需要身份验证',
  invalidSession: '无效会话',
  userNotFound: '找不到用户',
  otpAlreadyEnabled: 'OTP已启用',
  otpNotEnabled: 'OTP未启用',
  otpNotEnabledForAccount: '此账户未启用OTP',
  otpSecretNotFound: '找不到OTP密钥',
  otpTokenRequired: '需要OTP令牌',
  otpTokenRequiredToDisable: '需要OTP令牌才能禁用2FA',
  invalidOtpToken: '无效的OTP令牌',
  secretAndOtpRequired: '需要密钥和OTP令牌',
  failedToEnableOtp: '启用OTP失败',
  failedToDisableOtp: '禁用OTP失败',
  internalServerError: '内部服务器错误',
  invalidCredentials: '用户名或密码无效',
  usernameExists: '用户名已存在',
  currentPasswordIncorrect: '当前密码错误',
  passwordMismatch: '新密码和确认密码不匹配',
  passwordTooShort: '新密码至少需要6个字符',
  currentPasswordRequired: '需要当前密码和新密码',
  newPasswordRequired: '新密码至少需要6个字符',
  tunnelNotFound: '找不到隧道',
  invalidTunnelId: '无效的隧道ID',
  nameAndPortRequired: '需要名称和外部端口',
  portMustBeNumber: '外部端口必须是数字',
  portOutOfRange: '外部端口必须在10000-65535范围内',
  bandwidthMustBePositive: '最大带宽必须是正数（字节/秒）',
  bandwidthRequiredForPatch: 'PATCH操作需要最大带宽',
  portInUse: '端口已被使用',
};

// 获取请求的语言偏好，默认为英文
function getLocale(req: NextApiRequest): 'en' | 'zh' {
  // 从Accept-Language头获取
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const lang = acceptLanguage.split(',')[0].split('-')[0];
    if (lang === 'zh') return 'zh';
  }

  // 从自定义头获取
  const langHeader = req.headers['x-language'];
  if (langHeader === 'zh') return 'zh';

  // 默认返回英文
  return 'en';
}

// 获取错误消息
export function getErrorMessage(req: NextApiRequest, key: keyof ErrorMessages): string {
  const locale = getLocale(req);
  const errors = locale === 'zh' ? zhErrors : enErrors;
  return errors[key];
}

// 便捷方法：发送错误响应
export function sendError(res: NextApiResponse, status: number, message: string) {
  return res.status(status).json({ error: message });
}

// 便捷方法：发送国际化错误响应
export function sendLocalizedError(
  req: NextApiRequest,
  res: NextApiResponse,
  status: number,
  errorKey: keyof ErrorMessages
) {
  const message = getErrorMessage(req, errorKey);
  return sendError(res, status, message);
}

// 类型导出
export type { ErrorMessages };
