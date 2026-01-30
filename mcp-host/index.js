// index.js - 完整的魔塔MCP代理服务器
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// 动态导入fetch（兼容Node.js不同版本）
let fetch;
try {
    if (globalThis.fetch) {
        fetch = globalThis.fetch;
    } else {
        const { default: nodeFetch } = await
        import ('node-fetch');
        fetch = nodeFetch;
    }
} catch (error) {
    console.error('无法加载fetch:', error);
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// 魔塔MCP配置
const MODEL_SCOPE_API_KEY = 'ms-6f2b1ae3-ebd0-4b0c-9e6c-985548a9a93b';
const MODEL_SCOPE_MCP_URL = 'https://mcp.api-inference.modelscope.net/b2c4da11866d4b/mcp';

// 全局状态
let mcpState = {
    sessionId: null,
    isInitialized: false,
    tools: [],
    lastError: null,
    initializationTime: null
};

/**
 * 创建MCP请求ID
 */
function createRequestId(prefix = 'req') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 发送MCP请求（核心函数）
 */
async function sendMcpRequest(method, params = {}, options = {}) {
    const {
        isInitialization = false,
            retryOnSessionExpired = true,
            maxRetries = 1
    } = options;

    const requestId = createRequestId(method);

    // 构建请求体
    const requestBody = {
        jsonrpc: '2.0',
        method: method,
        id: requestId
    };

    // 根据方法决定是否添加params
    if (method === 'initialize' || Object.keys(params).length > 0) {
        requestBody.params = params;
    }

    console.log(`\n📤 [${new Date().toISOString()}] 发送 ${method} 请求`);
    console.log('请求ID:', requestId);
    console.log('请求体:', JSON.stringify(requestBody, null, 2));

    // 构建请求头
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MODEL_SCOPE_API_KEY}`,
        'Accept': 'application/json, text/event-stream',
        'User-Agent': 'MCP-Proxy/1.0.0'
    };

    // 如果不是初始化请求且存在sessionId，添加到头部
    if (!isInitialization && mcpState.sessionId) {
        headers['mcp-session-id'] = mcpState.sessionId;
        console.log('携带Session ID:', mcpState.sessionId);
    }

    let retryCount = 0;

    while (retryCount <= maxRetries) {
        try {
            const response = await fetch(MODEL_SCOPE_MCP_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                timeout: 30000 // 30秒超时
            });

            console.log(`📥 响应状态: ${response.status} ${response.statusText}`);

            // 从响应头获取session-id
            const responseSessionId = response.headers.get('mcp-session-id');
            if (responseSessionId) {
                console.log('🔄 收到Session ID:', responseSessionId);
                mcpState.sessionId = responseSessionId;
            }

            const responseText = await response.text();
            console.log('📄 响应内容长度:', responseText.length, '字符');

            if (!response.ok) {
                // 如果是会话过期错误且允许重试
                if (response.status === 401 && retryOnSessionExpired && retryCount < maxRetries) {
                    console.log('🔄 会话可能过期，尝试重新初始化...');
                    mcpState.isInitialized = false;
                    mcpState.sessionId = null;
                    retryCount++;
                    continue;
                }

                throw new Error(`HTTP ${response.status}: ${response.statusText}\n响应: ${responseText.substring(0, 500)}`);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('JSON解析失败:', parseError.message);
                throw new Error(`响应不是有效的JSON: ${responseText.substring(0, 200)}`);
            }

            // 检查MCP协议错误
            if (data.error) {
                const errorCode = data.error.code || 'UNKNOWN';
                const errorMessage = data.error.message || '未知错误';
                const errorData = data.error.data || '';

                console.error(`❌ MCP协议错误 [${errorCode}]:`, errorMessage);

                // 特定错误处理
                if (errorCode === -32602 && method === 'tools/list') {
                    console.log('⚠️ tools/list参数错误，尝试不带参数重试...');
                    if (retryCount === 0) {
                        retryCount++;
                        // 重试时不带params
                        delete requestBody.params;
                        continue;
                    }
                }

                throw new Error(`MCP错误 [${errorCode}]: ${errorMessage} ${errorData}`);
            }

            console.log('✅ 请求成功');

            // 如果是初始化请求，更新状态
            if (method === 'initialize' && data.result) {
                mcpState.isInitialized = true;
                mcpState.initializationTime = new Date().toISOString();
                console.log('✅ MCP会话已初始化');
            }

            return data.result;

        } catch (error) {
            console.error(`❌ 请求失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, error.message);

            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`🔄 等待1秒后重试 (${retryCount}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            mcpState.lastError = error.message;
            throw error;
        }
    }

    throw new Error('所有重试都失败了');
}

/**
 * 初始化MCP会话
 */
async function initializeMcpSession() {
    console.log('\n🔄 ===== 开始初始化MCP会话 =====');

    try {
        const capabilities = {
            tools: {},
            prompts: {},
            resources: {}
        };

        const clientInfo = {
            name: 'amap-mcp-client',
            version: '1.0.0'
        };

        const initializeParams = {
            protocolVersion: '2024-11-05',
            capabilities: capabilities,
            clientInfo: clientInfo
        };

        const result = await sendMcpRequest('initialize', initializeParams, {
            isInitialization: true,
            maxRetries: 2
        });

        console.log('✅ MCP会话初始化成功');

        if (result.serverInfo) {
            console.log('服务器信息:', JSON.stringify(result.serverInfo, null, 2));
        }

        return result;
    } catch (error) {
        console.error('❌ MCP会话初始化失败');
        throw error;
    }
}

/**
 * 获取工具列表
 */
async function getToolsList() {
    console.log('\n📋 ===== 获取工具列表 =====');

    try {
        // 尝试不同的参数格式
        const testCases = [
            { name: '空对象参数', params: {} },
            { name: '无参数', params: undefined }
        ];

        for (const testCase of testCases) {
            console.log(`\n🧪 尝试方案: ${testCase.name}`);

            try {
                const result = await sendMcpRequest('tools/list', testCase.params, {
                    maxRetries: 0 // 不重试，快速测试
                });

                if (result.tools && Array.isArray(result.tools)) {
                    console.log(`✅ 方案 "${testCase.name}" 成功`);
                    mcpState.tools = result.tools;
                    console.log(`获取到 ${mcpState.tools.length} 个工具`);
                    return result;
                }
            } catch (error) {
                console.log(`⚠️ 方案 "${testCase.name}" 失败:`, error.message);
                continue;
            }
        }

        // 如果以上都失败，尝试不传params
        console.log('\n🧪 尝试不传递params参数');
        try {
            const result = await sendMcpRequest('tools/list');

            if (result.tools && Array.isArray(result.tools)) {
                console.log('✅ 不传params成功');
                mcpState.tools = result.tools;
                console.log(`获取到 ${mcpState.tools.length} 个工具`);
                return result;
            }
        } catch (error) {
            console.log('⚠️ 不传params也失败:', error.message);
        }

        throw new Error('无法获取工具列表，所有方案都失败了');

    } catch (error) {
        console.error('❌ 获取工具列表失败');
        throw error;
    }
}

/**
 * 调用MCP工具
 */
async function callMcpTool(toolName, args) {
    console.log(`\n🔧 ===== 调用工具: ${toolName} =====`);
    console.log('调用参数:', JSON.stringify(args, null, 2));

    try {
        // 验证工具是否存在
        const toolExists = mcpState.tools.find(t => t.name === toolName);
        if (!toolExists && mcpState.tools.length > 0) {
            throw new Error(`工具 "${toolName}" 不存在。可用工具: ${mcpState.tools.map(t => t.name).join(', ')}`);
        }

        const callParams = {
            name: toolName,
            arguments: args
        };

        const result = await sendMcpRequest('tools/call', callParams, {
            maxRetries: 1
        });

        console.log(`✅ 工具调用成功: ${toolName}`);
        return result;

    } catch (error) {
        console.error(`❌ 工具调用失败: ${toolName}`, error.message);
        throw error;
    }
}

/**
 * 完整的MCP初始化流程
 */
async function performFullInitialization() {
    console.log('\n🎯 ===== 执行完整MCP初始化流程 =====');

    try {
        // 1. 初始化会话
        await initializeMcpSession();

        // 2. 获取工具列表
        await getToolsList();

        console.log('\n🎉 MCP初始化流程完成');
        console.log(`✅ Session ID: ${mcpState.sessionId}`);
        console.log(`✅ 工具数量: ${mcpState.tools.length}`);

        if (mcpState.tools.length > 0) {
            console.log('\n🔧 可用工具列表:');
            mcpState.tools.forEach((tool, index) => {
                console.log(`  ${index + 1}. ${tool.name}`);
                if (tool.description) console.log(`     描述: ${tool.description}`);
            });
        }

        return {
            sessionId: mcpState.sessionId,
            toolsCount: mcpState.tools.length,
            tools: mcpState.tools.map(t => t.name)
        };

    } catch (error) {
        console.error('❌ MCP初始化流程失败');
        throw error;
    }
}

// ==================== Express API 端点 ====================

/**
 * 1. 完整初始化端点
 */
app.post('/mcp/initialize', async(req, res) => {
    try {
        const result = await performFullInitialization();

        res.json({
            success: true,
            message: 'MCP服务初始化成功',
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'MCP服务初始化失败',
            error: error.message,
            state: {
                hasSession: !!mcpState.sessionId,
                toolsCount: mcpState.tools.length,
                lastError: mcpState.lastError
            }
        });
    }
});

/**
 * 2. 获取工具列表端点
 */
app.get('/mcp/tools', async(req, res) => {
    try {
        // 检查是否已初始化
        if (!mcpState.isInitialized) {
            return res.status(400).json({
                success: false,
                error: 'MCP会话未初始化',
                suggestion: '请先调用 /mcp/initialize 进行初始化'
            });
        }

        // 如果还没有工具列表，尝试获取
        if (mcpState.tools.length === 0) {
            try {
                await getToolsList();
            } catch (error) {
                // 即使获取失败，也返回当前状态
                console.log('获取工具列表失败，但继续处理请求');
            }
        }

        res.json({
            success: true,
            sessionId: mcpState.sessionId,
            toolsCount: mcpState.tools.length,
            tools: mcpState.tools.map(tool => ({
                name: tool.name,
                description: tool.description || '无描述',
                inputSchema: tool.inputSchema || {},
                hasArguments: !!(tool.inputSchema && Object.keys(tool.inputSchema).length > 0)
            })),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            sessionId: mcpState.sessionId,
            toolsCount: mcpState.tools.length
        });
    }
});

/**
 * 3. 调用工具端点
 */
app.post('/mcp/amap', async(req, res) => {
    try {
        const { tool, args } = req.body;

        if (!tool) {
            return res.status(400).json({
                success: false,
                error: '缺少必填参数: tool'
            });
        }

        // 检查是否已初始化
        if (!mcpState.isInitialized) {
            return res.status(400).json({
                success: false,
                error: 'MCP会话未初始化',
                suggestion: '请先调用 /mcp/initialize 进行初始化'
            });
        }

        const result = await callMcpTool(tool, args || {});

        res.json({
            success: true,
            tool: tool,
            sessionId: mcpState.sessionId,
            result: result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('API调用失败:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            tool: req.body.tool,
            sessionId: mcpState.sessionId
        });
    }
});

/**
 * 4. 测试连接端点
 */
app.get('/mcp/test', async(req, res) => {
    try {
        // 尝试获取工具列表来测试连接
        if (!mcpState.isInitialized) {
            return res.json({
                success: false,
                message: 'MCP会话未初始化',
                state: mcpState
            });
        }

        res.json({
            success: true,
            message: 'MCP服务连接正常',
            state: {
                sessionId: mcpState.sessionId,
                isInitialized: mcpState.isInitialized,
                toolsCount: mcpState.tools.length,
                initializationTime: mcpState.initializationTime,
                lastError: mcpState.lastError
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'MCP服务连接测试失败',
            error: error.message,
            state: mcpState
        });
    }
});

/**
 * 5. 状态检查端点
 */
app.get('/mcp/status', (req, res) => {
    res.json({
        success: true,
        state: mcpState,
        endpoints: [
            { method: 'POST', path: '/mcp/initialize', description: '完整初始化MCP服务' },
            { method: 'GET', path: '/mcp/tools', description: '获取工具列表' },
            { method: 'POST', path: '/mcp/amap', description: '调用MCP工具' },
            { method: 'GET', path: '/mcp/test', description: '测试连接' },
            { method: 'GET', path: '/mcp/status', description: '获取当前状态' },
            { method: 'POST', path: '/mcp/reset', description: '重置会话' },
            { method: 'GET', path: '/health', description: '健康检查' }
        ],
        timestamp: new Date().toISOString()
    });
});

/**
 * 6. 重置会话端点
 */
app.post('/mcp/reset', async(req, res) => {
    try {
        console.log('\n🔄 重置MCP会话');

        // 保存旧状态
        const oldState = {...mcpState };

        // 重置状态
        mcpState = {
            sessionId: null,
            isInitialized: false,
            tools: [],
            lastError: null,
            initializationTime: null
        };

        res.json({
            success: true,
            message: 'MCP会话已重置',
            oldState: oldState,
            newState: mcpState,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 7. 健康检查端点
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'MCP Proxy Server',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        mcpState: {
            isInitialized: mcpState.isInitialized,
            toolsCount: mcpState.tools.length,
            hasSession: !!mcpState.sessionId
        }
    });
});
const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 8. 主页 - 提供Web界面
 */
app.get('/', (req, res) => {
    // 读取index.html文件并发送给客户端
    // res.render(fs.readFileSync('index.html'));
    try {
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (error) {
        console.error('发送文件失败:', error);
        res.status(500).send('无法加载页面');
    }
});

// ==================== 启动服务器 ====================
const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                 🚀 MCP代理服务器启动成功                     ║
    ╠══════════════════════════════════════════════════════════════╣
    ║ 本地地址: http://localhost:${PORT}                             ║
    ║ MCP端点: ${MODEL_SCOPE_MCP_URL}                              ║
    ║ API Key: ${MODEL_SCOPE_API_KEY.substring(0, 10)}...          ║
    ╠══════════════════════════════════════════════════════════════╣
    ║ 📋 可用端点:                                                 ║
    ║   GET  /              - Web控制台                            ║
    ║   GET  /health        - 健康检查                             ║
    ║   POST /mcp/initialize - 初始化MCP服务                       ║
    ║   GET  /mcp/tools     - 获取工具列表                         ║
    ║   POST /mcp/amap      - 调用MCP工具                          ║
    ║   GET  /mcp/test      - 测试连接                             ║
    ║   GET  /mcp/status    - 获取状态                             ║
    ║   POST /mcp/reset     - 重置会话                             ║
    ╠══════════════════════════════════════════════════════════════╣
    ║ 💡 使用说明:                                                 ║
    ║   1. 访问 http://localhost:${PORT}                            ║
    ║   2. 点击"初始化MCP服务"按钮                                 ║
    ║   3. 初始化成功后获取工具列表                                 ║
    ║   4. 选择工具并测试调用                                       ║
    ╚══════════════════════════════════════════════════════════════╝
    `);

    // 启动时自动检查状态
    setTimeout(async() => {
        try {
            const healthResponse = await fetch(`http://localhost:${PORT}/health`);
            const healthData = await healthResponse.json();
            console.log('\n✅ 服务器启动状态:', healthData.status);
        } catch (error) {
            console.log('\n⚠️ 服务器健康检查失败（可能仍在启动中）');
        }
    }, 1000);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('\n🛑 收到关闭信号，正在关闭服务器...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\n🛑 收到中断信号，正在关闭服务器...');
    process.exit(0);
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
    console.error('\n💥 未捕获异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n💥 未处理的Promise拒绝:', reason);
});