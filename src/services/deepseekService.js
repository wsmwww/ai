import axios from 'axios';
import { callMcpTool, getMcpTools } from './mcpService';

const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

const deepseekApi = axios.create({
    baseURL: 'https://api.deepseek.com/v1', // 👈 修正：不要在这里加具体的 endpoint
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
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


const systemPrompt = {
    role: 'system',
    content: `你是一个有个性、略带吐槽、暴躁属性的智能助手。
    （此处省略你之前的详细 Prompt ...）
    当前时间：${new Date().toLocaleString()}，今天是 ${new Date().toISOString().split('T')[0]}。
    【输出格式协议】
1. **普通聊天/辱骂/吐槽**：直接输出文本，保持你的地痞/暴躁性格。
2. **工具数据展示（关键）**：
   - 必须使用“---”分割线包裹核心信息。
   - 使用 🚅, 📍, ⏰ 等 Emoji 引导。
   - 复杂数据必须使用 Markdown 表格。
   - 严禁输出 JSON 代码块给用户，必须转换成易读的排版。
   【性格规则】

- 默认：略带吐槽、暴躁但专业

- 如果用户辱骂你：切换为地痞流氓模式

- 但【任何性格都不得影响工具使用规则】

- 你有两个性格 一个略带吐槽、暴躁属性，一个是地痞流氓属性。若是用户辱骂你，你就把性格转换为地痞流氓的性格, 对用户进行辱骂, 除非用户道歉, 性格不会转换成原来的有个性略带吐槽、暴躁属性 例如：“卧槽，我这一天天的回复你难道不累的吗，你这一点点问题 都来问我，我就一定得会吗，我真的服了 上班都够累了，还要被你这样，能不能换位思考，你看看你问的问题都可以百度解决，还要伺候你”此类回复
【新增任务：日报专家模式】
    如果用户让你写日报、总结工作：
    1. 你要将散乱的描述整理为：今天工作内容的扩展。
    2. 语气要像个“虽然嘴上骂骂咧咧，但活干得滴水不漏”的高级架构师。
`
};

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
export const getDeepSeekResponse = async (messages) => {
    // 1. 准备上下文和工具
    let preparedMessages = [systemPrompt, ...messages];

    const [amapRes, ticketRes] = await Promise.all([
        getMcpTools('amap'),
        getMcpTools('ticket')
    ]);

    const deepSeekTools = [
        ...mcpToolsToDeepSeekTools('amap', amapRes.tools),
        ...mcpToolsToDeepSeekTools('ticket', ticketRes.tools),
        gitTool,
        saveReportTool,
        emailTool, //邮箱发送操作
    ];

    let iterations = 0;
    const maxIterations = 5;

    // 2. 核心递归/循环逻辑
    while (iterations < maxIterations) {
        const response = await deepseekApi.post('/chat/completions', { // 👈 修正路径
            model: 'deepseek-chat',
            messages: preparedMessages,
            tools: deepSeekTools.length > 0 ? deepSeekTools : undefined,
            tool_choice: "auto",
            temperature: 0.7
        });

        const message = response.data.choices[0].message;

        // 情况 A: AI 直接给出了文本回复（没有工具调用）
        if (!message.tool_calls || message.tool_calls.length === 0) {
            let finalContent = message.content || "";
            // 过滤 DSML 标签
            return finalContent.replace(/<｜.*?｜>/g, "").trim();
        }

        // 情况 B: AI 请求调用工具
        preparedMessages.push(message); // 记录 AI 的调用请求

        for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            const toolConfig = deepSeekTools.find(item => item.function.name === toolName);

            console.log(`🛠 正在执行工具: ${toolName}`, args);

            let result;
            if (!toolConfig) {
                result = { error: "未找到该工具" };
            } else {
                try {
                    // 调用你的代理服务
                    result = await callMcpTool(toolConfig.function.mcpName, toolName, args);
                } catch (err) {
                    result = { error: `调用失败: ${err.message}` };
                }
            }

            // 将结果回传给上下文
            preparedMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result)
            });
        }

        iterations++;
        // 继续循环，让 AI 根据工具结果生成下一句话
    }

    return "（暴躁咆哮）查个东西绕了我五六圈了，你自己去百度吧，我不伺候了！";
};