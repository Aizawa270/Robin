const { EmbedBuilder } = require('discord.js');

// CSS color list (extend anytime, no DB needed)
const cssColors = {
  aliceblue: '#F0F8FF',
  antiquewhite: '#FAEBD7',
  aqua: '#00FFFF',
  aquamarine: '#7FFFD4',
  azure: '#F0FFFF',
  beige: '#F5F5DC',
  black: '#000000',
  blue: '#0000FF',
  brown: '#A52A2A',
  crimson: '#DC143C',
  cyan: '#00FFFF',
  darkblue: '#00008B',
  darkcyan: '#008B8B',
  darkgoldenrod: '#B8860B',
  darkgray: '#A9A9A9',
  darkgreen: '#006400',
  darkmagenta: '#8B008B',
  darkorange: '#FF8C00',
  darkred: '#8B0000',
  deeppink: '#FF1493',
  gold: '#FFD700',
  gray: '#808080',
  green: '#008000',
  hotpink: '#FF69B4',
  indigo: '#4B0082',
  lavender: '#E6E6FA',
  lime: '#00FF00',
  magenta: '#FF00FF',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  orange: '#FFA500',
  orchid: '#DA70D6',
  pink: '#FFC0CB',
  purple: '#800080',
  red: '#FF0000',
  silver: '#C0C0C0',
  teal: '#008080',
  tomato: '#FF6347',
  violet: '#EE82EE',
  white: '#FFFFFF',
  yellow: '#FFFF00',
};

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map(v => Number(v).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

module.exports = {
  name: 'findhex',
  aliases: ['fh'],
  description: 'Find the hex code of any color.',
  category: 'utility',
  usage: '$fh <color | #hex | r g b>',

  async execute(client, message, args) {
    // ❌ NO PERMISSION CHECKS — PUBLIC COMMAND

    if (!args.length) {
      return message.reply('Give me a color name, hex, or RGB.\nExample: `!fh crimson`');
    }

    let hex;
    let label;

    // HEX input
    if (/^#?[0-9A-Fa-f]{6}$/.test(args[0])) {
      hex = args[0].startsWith('#') ? args[0].toUpperCase() : `#${args[0].toUpperCase()}`;
      label = 'Custom Hex';

    // RGB input
    } else if (
      args.length === 3 &&
      args.every(n => !isNaN(n) && n >= 0 && n <= 255)
    ) {
      hex = rgbToHex(args[0], args[1], args[2]);
      label = `RGB(${args.join(', ')})`;

    // Color name
    } else {
      const name = args.join('').toLowerCase();
      if (!cssColors[name]) {
        return message.reply('Unknown color. Try a CSS color name, hex, or RGB.');
      }
      hex = cssColors[name];
      label = name.charAt(0).toUpperCase() + name.slice(1);
    }

    const embed = new EmbedBuilder()
      .setColor(hex)
      .setDescription(`**${label}**\nHex: \`${hex}\``)
      .setFooter({ text: 'findhex • color preview' });

    return message.reply({ embeds: [embed] });
  },
};