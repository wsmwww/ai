# MCP服务集成说明

## 已完成的工作

1. ✅ 创建了 `src/services/mcpService.js` - MCP服务封装
2. ✅ 修改了 `src/services/deepseekService.js` - 集成MCP服务调用
3. ✅ 高德地图POI查询已改为使用MCP服务

## 使用步骤

### 1. 启动MCP代理服务

在 `mcp-host` 目录下运行：

```bash
cd mcp-host
npm run start:mcp
```

服务将在 `http://localhost:3334` 启动

### 2. 配置环境变量（可选）

如果需要修改MCP代理服务地址，可以在项目根目录创建 `.env` 文件：

```env
VITE_MCP_PROXY_URL=http://localhost:3334
```

如果不配置，默认使用 `http://localhost:3334`

### 3. 启动React项目

```bash
npm run dev
```

## 功能说明

- **天气查询**：继续使用原有的天气服务
- **高德地图POI查询**：已改为通过MCP服务调用
  - 工具名称：`maps_text_search`
  - 支持关键词搜索和城市筛选

## 测试

在聊天界面输入：
- "北京天安门附近的餐厅"
- "上海外滩的酒店"
- "深圳科技园的星巴克"

系统会自动调用MCP服务进行查询并返回结果。