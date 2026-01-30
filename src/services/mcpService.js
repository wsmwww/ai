import axios from 'axios';

// MCP代理服务地址
const MCP_PROXY_URL = import.meta.env.VITE_MCP_PROXY_URL || 'http://localhost:3334';

const mcpApi = axios.create({
    baseURL: MCP_PROXY_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// MCP服务初始化状态
let isMcpInitialized = false;

/**
 * 初始化MCP服务（如果尚未初始化）
 */
export async function ensureMcpInitialized(mcp = 'amap') {
    if (isMcpInitialized) {
        return { success: true };
    }

    try {
        const response = await mcpApi.post('/mcp/initialize', { mcp });
        console.log('MCP初始化响应:', response);
        if (response.data.success) {
            isMcpInitialized = true;
            console.log('✅ MCP服务初始化成功，可用工具数量:', response.data.toolsCount);
            return response.data;
        }
        throw new Error('MCP初始化失败');
    } catch (error) {
        console.error('❌ MCP服务初始化失败:', error);
        // 即使初始化失败，也尝试继续（可能已经初始化过了）
        isMcpInitialized = false;
        throw error;
    }
}

/**
 * 获取MCP工具列表
 */
export async function getMcpTools(mcp = 'amap') {
    try {
        await ensureMcpInitialized(mcp);
        const response = await mcpApi.get('/mcp/tools', {
            params: { mcp, }
        });
        return response.data;
    } catch (error) {
        console.error('获取MCP工具列表失败:', error);
        throw error;
    }
}

/**
 * 调用MCP工具
 * @param {string} toolName - 工具名称
 * @param {object} args - 工具参数
 * @returns {Promise<any>} 工具调用结果
 */
export async function callMcpTool(mcp, toolName, args = {}) {
    try {
       
        // 确保MCP服务已初始化
        await ensureMcpInitialized();
        const response = await mcpApi.post('/mcp/call', {
            mcp,
            tool: toolName,
            args: args,
        });
        if (response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.error || '工具调用失败');
        }
    } catch (error) {
        console.error(`调用MCP工具 ${toolName} 失败:`, error);
        throw error;
    }
}
