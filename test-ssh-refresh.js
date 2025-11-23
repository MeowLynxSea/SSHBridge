// 测试SSH客户端status命令的刷新间隔
import { Client } from 'ssh2';
import net from 'net';

// 创建SSH连接并测试status命令
function testSSHStatusCommand(username, password, expectedInterval) {
  return new Promise((resolve) => {
    console.log(`\n🔗 测试用户 ${username} 的SSH status命令...`);
    console.log(`   预期刷新间隔: ${expectedInterval}ms`);
    
    const conn = new Client();
    let refreshCount = 0;
    let firstRefreshTime = null;
    let refreshTimes = [];
    
    conn.on('ready', () => {
      console.log('   ✅ SSH连接已建立');
      
      // 请求一个会话
      conn.shell((err, stream) => {
        if (err) {
          console.error('   ❌ 创建shell失败:', err.message);
          resolve(false);
          return;
        }
        
        console.log('   ✅ SSH shell已打开');
        
        // 发送status命令
        stream.write('status\n');
        
        let statusStarted = false;
        
        stream.on('data', (data) => {
          const output = data.toString();
          
          // 检测status命令开始
          if (output.includes('SSHBridge Tunnel Status Monitor')) {
            if (!statusStarted) {
              statusStarted = true;
              firstRefreshTime = Date.now();
              refreshCount = 1;
              console.log('   📊 Status监控已启动，开始计时...');
              
              // 3秒后发送Ctrl+C退出status命令
              setTimeout(() => {
                stream.write('\x03');
                
                // 计算平均刷新间隔
                let avgInterval = 0;
                if (refreshTimes.length > 1) {
                  const intervals = refreshTimes.slice(1); // 排除第一次
                  avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
                }
                
                console.log(`   📈 检测到 ${refreshCount} 次刷新`);
                if (avgInterval > 0) {
                  console.log(`   ⏱️ 平均刷新间隔: ${Math.round(avgInterval)}ms`);
                  console.log(`   🎯 预期间隔: ${expectedInterval}ms`);
                  console.log(`   ✅ 测试结果: ${Math.abs(avgInterval - expectedInterval) < 500 ? '通过' : '失败'}`);
                } else {
                  console.log('   ⚠️ 检测到的刷新次数不足');
                }
                
                conn.end();
                resolve(avgInterval > 0 && Math.abs(avgInterval - expectedInterval) < 500);
              }, 3000);
            }
            return;
          }
          
          // 检测表格刷新（通过"Last updated"文本）
          if (statusStarted && output.includes('Last updated:')) {
            const currentTime = Date.now();
            if (firstRefreshTime && currentTime > firstRefreshTime) {
              const interval = currentTime - firstRefreshTime;
              refreshTimes.push(interval);
              firstRefreshTime = currentTime;
              refreshCount++;
              console.log(`   🔄 检测到第 ${refreshCount} 次刷新，间隔: ${interval}ms`);
            }
          }
        });
        
        stream.on('close', () => {
          console.log('   ✅ SSH连接已关闭');
        });
      });
    });
    
    conn.on('error', (err) => {
      console.error('   ❌ SSH连接错误:', err.message);
      resolve(false);
    });
    
    // 连接到SSH服务器
    conn.connect({
      host: 'localhost',
      port: 2222,
      username,
      password
    });
  });
}

// 主测试函数
async function testSSHRefreshIntervals() {
  console.log('🚀 开始测试SSH客户端status命令的刷新间隔...\n');
  
  // 首先确保SSH服务器正在运行
  console.log('🔍 检查SSH服务器状态...');
  const isServerRunning = await new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(2222, 'localhost');
  });
  
  if (!isServerRunning) {
    console.log('❌ SSH服务器未运行，请先启动SSH服务器');
    return;
  }
  
  console.log('✅ SSH服务器正在运行\n');
  
  // 测试用户1（3秒间隔）
  console.log('👤 测试用户1 (3秒刷新间隔)');
  const test1Result = await testSSHStatusCommand('user1', 'pass123', 3000);
  
  // 等待一秒钟
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 测试用户2（1.5秒间隔）
  console.log('👤 测试用户2 (1.5秒刷新间隔)');
  const test2Result = await testSSHStatusCommand('user2', 'pass123', 1500);
  
  console.log('\n🎉 SSH刷新间隔测试完成！');
  console.log('\n📋 测试结果:');
  console.log(`用户1测试: ${test1Result ? '✅ 通过' : '❌ 失败'}`);
  console.log(`用户2测试: ${test2Result ? '✅ 通过' : '❌ 失败'}`);
  
  const allTestsPassed = test1Result && test2Result;
  console.log(`\n🎯 总体结果: ${allTestsPassed ? '✅ 所有测试通过' : '❌ 部分测试失败'}`);
  
  if (allTestsPassed) {
    console.log('\n🎊 恭喜！用户特定刷新间隔功能完全正常工作！');
    console.log('   - SSH服务器正确读取用户设置');
    console.log('   - status命令使用用户特定的刷新间隔');
    console.log('   - 不同用户的设置互不影响');
  }
}

testSSHRefreshIntervals().catch(console.error);