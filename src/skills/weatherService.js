import axios from 'axios';
import { WEATHER_API_KEY } from '../config';

// 从配置文件读取天气 API 密钥
// https://api.openweathermap.org/data/2.5/weather?units=metric&lang=zh_cn&q=Shenzhen
// 创建天气 API 实例
const weatherApi = axios.create({
    baseURL: 'https://api.openweathermap.org/data/2.5', // OpenWeatherMap API 基础地址
    params: {
        appid: WEATHER_API_KEY,
        units: 'metric', // 使用摄氏度
        lang: 'zh_cn' // 中文响应
    }
});

// 获取城市天气
export const getWeatherByCity = async(city) => {
    try {
        const response = await weatherApi.get('/weather', {
            params: { q: city + ',CN' }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting weather:', error);
        throw error;
    }
};