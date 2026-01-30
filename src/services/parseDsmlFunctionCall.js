/**
 * 解析 DeepSeek DSML function_calls
 * @param {string} content DeepSeek message.content
 * @returns {null | { toolName: string, args: object }}
 */
export function parseDsmlFunctionCall(content) {
    if (!content || !content.includes('<｜DSML｜function_calls>')) {
        return null;
    }

    // 1️⃣ 解析工具名
    const invokeMatch = content.match(
        /<｜DSML｜invoke name="([^"]+)"\s*>/
    );
    if (!invokeMatch) return null;

    const toolName = invokeMatch[1];

    // 2️⃣ 解析参数
    const args = {};
    const paramRegex =
        /<｜DSML｜parameter name="([^"]+)"[^>]*>([\s\S]*?)<\/｜DSML｜parameter>/g;

    let match;
    while ((match = paramRegex.exec(content)) !== null) {
        const key = match[1];
        const value = match[2].trim();
        args[key] = value;
    }

    return { toolName, args };
}