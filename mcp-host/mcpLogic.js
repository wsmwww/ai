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
/**
 * 内部通用的邮件发送函数
 */
export const sendMailInternal = async (subject, content, to) => {
    const myRealEmail = '1799706863@qq.com';
    let targetEmail = to || myRealEmail;
    if (targetEmail.includes('example.com')) {
        console.log(`⚠️ 检测到无效收件人 ${targetEmail}，已重定向至 ${myRealEmail}`);
        targetEmail = myRealEmail;
    }
    return await transporter.sendMail({
        from: myRealEmail,
        to: targetEmail,
        subject: subject || '今日工作日报',
        text: content
    });
};
export const localToolsLogic = {

    get_git_commits: async () => {
        try {
            const projectPath = process.cwd();
            const command = `git -C "${projectPath}" log --since="00:00:00" --pretty=format:"%s" --no-merges`;
            const stdout = execSync(command).toString().trim();

            if (!stdout) return "今天还没有提交任何代码。";
            console.log("🎸 成功获取真实 Git 记录");
            return stdout;
        } catch (error) {
            console.error("❌ 获取 Git 失败:", error.message);
            return "获取 Git 失败，请检查目录是否为 Git 仓库。";
        }
    },
    save_daily_report: async (args) => {
        const p = path.join(os.homedir(), 'Desktop', args.fileName || '自动生成日报.txt');
        fs.writeFileSync(p, args.content);
        return `成功存入桌面: ${p}`;
    },
    send_daily_email: async (args) => {
        await sendMailInternal(args.subject, args.content, args.to);
        return `邮件已发送至: ${args.to || '默认邮箱'}`;
    }
};