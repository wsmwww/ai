// test-mcp-format.js
import fetch from 'node-fetch';

const MODEL_SCOPE_API_KEY = 'ms-6f2b1ae3-ebd0-4b0c-9e6c-985548a9a93b';
const MODEL_SCOPE_MCP_URL = 'https://mcp.api-inference.modelscope.net/b2c4da11866d4b/mcp';

async function testDifferentFormats() {
    console.log('🧪 测试不同请求格式...\n');

    const testCases = [{
            name: '标准MCP格式',
            body: {
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: 'test-1'
            }
        },
        {
            name: '简化格式',
            body: {
                method: 'tools/list',
                params: {}
            }
        },
        {
            name: 'Claude格式',
            body: {
                action: 'list_tools',
                parameters: {}
            }
        },
        {
            name: '仅方法名',
            body: {
                method: 'tools/list'
            }
        }
    ];

    for (const testCase of testCases) {
        console.log(`📤 测试: ${testCase.name}`);
        console.log('请求体:', JSON.stringify(testCase.body, null, 2));

        try {
            const response = await fetch(MODEL_SCOPE_MCP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MODEL_SCOPE_API_KEY}`
                },
                body: JSON.stringify(testCase.body)
            });

            console.log(`响应状态: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const data = await response.json();
                console.log('响应数据:', JSON.stringify(data, null, 2));
                console.log('✅ 成功！');
            } else {
                const text = await response.text();
                console.log('错误响应:', text.substring(0, 200));
                console.log('❌ 失败');
            }

        } catch (error) {
            console.log('❌ 请求失败:', error.message);
        }

        console.log('---\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

testDifferentFormats();