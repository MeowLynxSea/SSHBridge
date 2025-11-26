#!/usr/bin/env node

/**
 * 测试CUI国际化功能
 */

const { CUII18n } = require('../src/cui');
const { Database } = require('../src/database');

// 模拟用户和数据库
const mockUser = { id: 1, username: 'testuser' };

// 创建一个简单的模拟数据库
const mockDatabase = {
  getUserSettings: async (userId) => {
    // 模拟不同的用户语言设置
    const settings = {
      1: { language: 'en' },
      2: { language: 'zh' },
      3: { language: 'es' },
      4: { language: 'de' },
      5: { language: 'ja' },
      6: { language: 'ru' },
      7: { language: 'ar' },
      8: { language: 'fr' },
    };
    
    return settings[userId] || { language: 'en' };
  }
};

async function testI18n() {
  console.log('Testing CUI Internationalization...\n');
  
  // 测试所有语言
  const languages = ['en', 'zh', 'es', 'de', 'ja', 'ru', 'ar', 'fr'];
  
  for (const lang of languages) {
    console.log(`\n=== Testing ${lang.toUpperCase()} ===`);
    
    // 创建具有特定语言的用户
    const testUser = { id: languages.indexOf(lang) + 1, username: 'testuser' };
    const i18n = new CUII18n(testUser.id, mockDatabase);
    
    // 初始化
    await i18n.init();
    
    // 测试基本翻译
    console.log(`Title: ${i18n.t('main.title')}`);
    console.log(`User: ${i18n.t('main.user')}`);
    console.log(`Select Action: ${i18n.t('main.selectAction')}`);
    console.log(`Goodbye: ${i18n.t('general.goodbye')}`);
    
    // 测试参数替换
    console.log(`Client->Server: ${i18n.t('tunnels.clientToServer', { port: 8080, addr: 'localhost' })}`);
    
    // 测试表格边框生成
    const tableBorders = i18n.getTableBorders();
    console.log(`Table Top Border: ${tableBorders.top}`);
    
    // 测试固定宽度文本
    console.log(`Fixed Width Status: ${i18n.getFixedWidthText('status', 'ACTIVE')}`);
    console.log(`Fixed Width Name: ${i18n.getFixedWidthText('tunnelName', 'Test Tunnel Name')}`);
    console.log(`Fixed Width Port: ${i18n.getFixedWidthText('externalPort', '8080')}`);
  }
  
  console.log('\n=== Test Complete ===');
}

// 运行测试
testI18n().catch(console.error);