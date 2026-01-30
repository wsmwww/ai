import axios from 'axios';

// 从环境变量读取高德地图API密钥
const AMAP_KEY =
    import.meta.env.VITE_AMAP_API_KEY;

// 创建高德地图API实例
const amapApi = axios.create({
    baseURL: 'https://restapi.amap.com/v3', // 高德Web服务基础URL
    params: {
        key: AMAP_KEY,
        output: 'json', // 返回JSON格式数据
    },
});

/**
 * 高德地图POI查询（场所查询）
 * @param {string} keyword 查询关键词（如「星巴克」「酒店」）
 * @param {string} city 城市名（英文/中文均可，如「Shenzhen」「深圳」）
 * @param {number} pageSize 返回结果数量（默认10条）
 * @returns {Promise<Object>} POI查询结果
 */
export const getPoiByKeyword = async(keyword, city, pageSize = 10) => {
    try {
        const response = await amapApi.get('/place/text', {
            params: {
                keywords: keyword,
                city: city,
                offset: pageSize,
                page: 1,
                extensions: 'base', // 返回基础信息（精简版）
            },
        });

        // 校验高德API返回状态
        if (response.data.status !== '1') {
            throw new Error(`高德POI查询失败：${response.data.info || '未知错误'}`);
        }

        return response.data;
    } catch (error) {
        console.error('Error getting AMAP POI:', error);
        throw error;
    }
};