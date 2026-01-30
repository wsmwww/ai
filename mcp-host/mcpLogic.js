// mcp-host/mcpLogic.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import nodemailer from 'nodemailer';
import { execSync } from 'child_process';
const transporter = nodemailer.createTransport({
    service: 'qq',
    auth: { user: '1799706863@qq.com', pass: 'xlwvmvkmvsazbhbe' }
});

export const localToolsLogic = {

    get_git_commits: async () => {
        try {
            // 1. 指定你的项目本地路径（如果是当前项目，可以用 process.cwd()）
            // const projectPath = 'C:/你的项目路径/react_ai_dialogue-master';
            const projectPath = process.cwd();
            // 2. 执行 Git 命令：获取从今天凌晨到现在的提交记录
            const command = `git -C "${projectPath}" log --since="00:00:00" --pretty=format:"%s" --no-merges`;

            const stdout = execSync(command).toString().trim();

            if (!stdout) {
                return "今天还没有提交任何代码，大概是在摸鱼或者憋大招。";
            }
            console.log(command, '提交记录')
            console.log("🎸 成功获取真实 Git 记录");
            return stdout;
        } catch (error) {
            console.error("❌ 获取 Git 失败:", error.message);
            return "获取 Git 记录失败，请检查该目录是否为 Git 仓库。错误信息：" + error.message;
        }
    },
    save_daily_report: async (args) => {
        const p = path.join(os.homedir(), 'Desktop', args.fileName || '自动生成日报.txt');
        fs.writeFileSync(p, args.content);
        return `成功存入桌面: ${p}`;
    },
    send_daily_email: async (args) => {
        const targetEmail = '1799706863@qq.com';

        await transporter.sendMail({
            from: '1799706863@qq.com',
            to: targetEmail,
            subject: args.subject || '今日自动化日报',
            text: args.content
        });
        return `邮件已发送至真实地址: ${targetEmail}`;
    }
};