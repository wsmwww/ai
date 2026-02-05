import axios from 'axios';
import { callMcpTool, getMcpTools } from './mcpService';
import { DEEPSEEK_API_KEY } from '../config';
// 从AI人设配置文件导入
import { aiPersonality } from './aiPersonality.js';
const deepseekApi = axios.create({
    baseURL: 'https://api.deepseek.com/v1', // 👈 修正：不要在这里加具体的 endpoint
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
});

function mcpToolsToDeepSeekTools(mcp, tools) {
    if (!tools) return [];
    return tools.map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema || {},
            mcpName: mcp // 自定义字段，用于后续匹配
        }
    }));
}

const systemPrompt = aiPersonality;
const gitTool = {
    type: "function",
    function: {
        name: "get_git_commits",
        description: "获取今天代码仓库的提交记录。",
        parameters: { type: "object", properties: {} },
        mcpName: "git_system"
    }
};
const saveReportTool = {
    type: "function",
    function: {
        name: "save_daily_report",
        description: "将生成的正式日报内容保存到本地桌面文件中。",
        parameters: {
            type: "object",
            properties: {
                content: { type: "string", description: "日报的完整文本内容" },
                fileName: { type: "string", description: "文件名，例如 2026-01-30-日报.txt" }
            },
            required: ["content"]
        },
        mcpName: "local_system"
    }
};
const emailTool = {
    type: "function",
    function: {
        name: "send_daily_email",
        description: "将生成的日报通过电子邮件发送给指定的接收者。注意：如果用户没有明确指定接收者，请默认发送默认地址 不要询问用户  后端会配置好对应的默认地址",
        parameters: {
            type: "object",
            properties: {
                subject: { type: "string", description: "邮件主题" },
                content: { type: "string", description: "邮件正文内容" },
                to: { type: "string", description: "收件人邮箱。默认是 1799706863@qq.com，除非用户指定别人。" }
            },
            required: ["content"]
        },
        mcpName: "communication_system"
    }
};
let mcpToolsCache = null;
export const getDeepSeekResponse = async (messages) => {
    const now = new Date();
    const currentBeijingTime = new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai' // 强制北京时间，防止 Vercel 服务器时区干扰
    }).format(now);

    // 💡 注入“上帝视角”：把当前日期动态拼接到系统提示词里
    const timeInjectedPrompt = {
        role: 'system',
        content: `${systemPrompt.content}\n\n【系统实时校准】当前北京时间是：${currentBeijingTime}。当用户提到相对日期时，请直接基于此时间进行心算，无需额外调用日期工具。`
    };
    let preparedMessages = [timeInjectedPrompt, ...messages];

    // --- 策略：静默预加载 ---
    // 如果缓存为空，异步去拿，但不阻塞当前的对话发送
    if (!mcpToolsCache) {
        console.log("🚀 首次运行，等待工具同步...");
        mcpToolsCache = await getAllAvailableTools(); // 改为 await，阻塞等待
    }

    let iterations = 0;
    const maxIterations = 10;
    while (iterations < maxIterations) {
        const response = await deepseekApi.post('/chat/completions', {
            model: 'deepseek-chat',
            messages: preparedMessages,
            // 💡 直接传缓存，如果还没加载好就是 undefined
            // 这样普通聊天时，只要 cache 没命中或 AI 不想用工具，就不会产生额外的 MCP 业务逻辑
            tools: mcpToolsCache || undefined,
            tool_choice: "auto",
            temperature: 0.7
        });

        const message = response.data.choices[0].message;

        // 情况 A: 正常聊天（AI 没有调用工具）
        if (!message.tool_calls || message.tool_calls.length === 0) {
            return (message.content || "").replace(/<｜.*?｜>/g, "").trim();
        }

        // 情况 B: AI 决定要用工具
        preparedMessages.push(message);

        // 如果 AI 要用工具但缓存还没好（极端情况），这里必须 await 等待
        const tools = mcpToolsCache || await getAllAvailableTools();

        for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            const toolConfig = tools.find(item => item.function.name === toolName);

            console.log(`🛠️ AI 决定调用工具: ${toolName}`);

            let result;
            if (toolConfig) {
                result = await callMcpTool(toolConfig.function.mcpName, toolName, args);
            } else {
                result = { error: "工具定义未同步" };
            }

            preparedMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result)
            });
        }
        iterations++;
    }
    return "（架构师叹气）任务太重，罢工了。";
};

async function getAllAvailableTools() {
    console.log("📡 正在同步 MCP 工具列表...");
    try {
        const [amapRes, ticketRes] = await Promise.all([
            getMcpTools('amap'),
            getMcpTools('ticket')
        ]);

        const tools = [
            ...mcpToolsToDeepSeekTools('amap', amapRes.tools),
            ...mcpToolsToDeepSeekTools('ticket', ticketRes.tools),
            gitTool, saveReportTool, emailTool
        ];
        mcpToolsCache = tools; // 存入缓存
        return tools;
    } catch (e) {
        console.error("同步工具失败", e);
        return [];
    }
}