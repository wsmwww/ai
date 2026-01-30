// skills/index.js
import { getWeatherByCity } from '../services/weatherService';
import { getPoiByKeyword } from '../services/amapService';

// 先把你现有的格式化函数也搬过来（或之后再抽）
const formatWeatherResponse = (weatherData) => {
    const { name, main, weather, wind } = weatherData;
    return `${name} 当前天气 ${weather[0].description}，温度 ${main.temp}℃，
湿度 ${main.humidity}%，风速 ${wind.speed} m/s。`;
};

const formatPoiResponse = (poiData) => {
    if (poiData.count === '0') {
        return '未查询到相关的场所信息，请更换关键词或城市重试。';
    }

    return poiData.pois.map((poi, i) =>
        `${i + 1}. ${poi.name}（${poi.address || '暂无地址'}）`
    ).join('\n');
};

/**
 * Skill Registry（核心）
 */
export const skills = {
    get_weather: {
        description: '获取城市天气',
        run: async({ city }) => {
            const data = await getWeatherByCity(city);
            return formatWeatherResponse(data);
        }
    },

    get_amap_poi: {
        description: '查询高德 POI',
        run: async({ keyword, city }) => {
            const data = await getPoiByKeyword(keyword, city);
            return formatPoiResponse(data);
        }
    }
};