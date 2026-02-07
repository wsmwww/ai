// mcp-host/cronAgent.js
import axios from 'axios';
import { localToolsLogic } from './mcpLogic.js';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. 指向上一级目录的 .env 文件
dotenv.config({ path: path.join(__dirname, '../.env') });
// 3. 此时再读取，API_KEY 就不再是 undefined 了
const API_KEY = process.env.VITE_DEEPSEEK_API_KEY;

// 复用你的工具定义
const deepSeekTools = [
    { type: "function", function: { name: "get_git_commits", description: "获取Git记录", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "save_daily_report", description: "存桌面", parameters: { type: "object", properties: { content: { type: "string" }, fileName: { type: "string" } }, required: ["content"] } } },
    { type: "function", function: { name: "send_daily_email", description: "发邮件", parameters: { type: "object", properties: { content: { type: "string" }, to: { type: "string" } }, required: ["content"] } } }
];

export const runCronReport = async () => {

    // 初始指令
    let preparedMessages = [
        { role: 'system', content: "你是一个专业的日报助手。请按顺序执行：读取今日笔记、读取Git提交记录、总结后保存到桌面、最后发送邮件。任务执行过程中不需要询问我，直接调用工具。" },
        { role: 'user', content: "现在开始生成日报。" }
    ];

    let iterations = 0;
    while (iterations < 5) {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            model: 'deepseek-chat',
            messages: preparedMessages,
            tools: deepSeekTools,
            tool_choice: "auto"
        }, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });

        const message = response.data.choices[0].message;

        if (!message.tool_calls) {
            return message.content;
        }

        preparedMessages.push(message);

        for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);


            // 直接执行本地逻辑
            const result = await localToolsLogic[toolName](args);

            preparedMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result)
            });
        }
        iterations++;
    }
};