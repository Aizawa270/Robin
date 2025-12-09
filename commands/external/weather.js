const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'weather',
  description: 'Shows current weather for a city.',
  category: 'external',
  usage: '$weather <city>',
  async execute(client, message, args) {
    const apiKey = process.env.WEATHERAPI_KEY;
    if (!apiKey) {
      console.error('WEATHERAPI_KEY is missing from process.env');
      return message.reply('Weather API key is not configured. (WEATHERAPI_KEY is missing in .env)');
    }

    const city = args.join(' ');
    if (!city) {
      return message.reply('Please provide a city. Example: `$weather London`');
    }

    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(
      city,
    )}&aqi=no`;

    console.log('Weather request URL:', url);

    try {
      // Use global fetch (Node 18+)
      const res = await fetch(url);
      console.log('WeatherAPI status:', res.status, res.statusText);

      const text = await res.text();
      console.log('WeatherAPI raw response:', text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('WeatherAPI: failed to parse JSON:', e);
        return message.reply('Weather service returned an invalid response. Try again later.');
      }

      if (!res.ok || data.error) {
        console.error('WeatherAPI error object:', data.error);
        const msg =
          data?.error?.message ||
          'Failed to fetch weather. Check the city name or API key and try again.';
        return message.reply(`Weather error: ${msg}`);
      }

      const loc = data.location;
      const cur = data.current;

      const tempC = cur.temp_c;
      const feelsC = cur.feelslike_c;
      const humidity = cur.humidity;
      const windKph = cur.wind_kph;
      const conditionText = cur.condition?.text || 'Unknown';
      const iconUrl = cur.condition?.icon ? `https:${cur.condition.icon}` : null;

      const lowerCond = conditionText.toLowerCase();
      let emoji = '🌈';
      if (lowerCond.includes('sun') || lowerCond.includes('clear')) emoji = '☀️';
      else if (lowerCond.includes('cloud')) emoji = '☁️';
      else if (lowerCond.includes('rain')) emoji = '🌧️';
      else if (lowerCond.includes('snow')) emoji = '❄️';
      else if (lowerCond.includes('storm') || lowerCond.includes('thunder')) emoji = '⛈️';
      else if (lowerCond.includes('fog') || lowerCond.includes('mist')) emoji = '🌫️';

      const embed = new EmbedBuilder()
        .setColor(colors.weather || '#38bdf8')
        .setTitle(`${emoji} Weather in ${loc.name}, ${loc.region || loc.country}`)
        .addFields(
          { name: 'Condition', value: conditionText, inline: false },
          { name: 'Temperature', value: `${tempC}°C`, inline: true },
          { name: 'Feels Like', value: `${feelsC}°C`, inline: true },
          { name: 'Humidity', value: `${humidity}%`, inline: true },
          { name: 'Wind Speed', value: `${windKph} km/h`, inline: true },
        );

      if (iconUrl) {
        embed.setThumbnail(iconUrl);
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Weather command error (WeatherAPI catch):', err);
      await message.reply('Failed to fetch weather data. Please try again later.');
    }
  },
};