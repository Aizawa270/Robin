const { EmbedBuilder } = require('discord.js');
const { evaluate } = require('mathjs');
const { colors } = require('../../config');

module.exports = {
  name: 'calc',
  description: 'Evaluates a math expression or shows a guide when used without arguments.',
  category: 'utility',
  usage: '$calc <expression>',
  async execute(client, message, args) {
    // If no args → show help/guide
    if (args.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(colors.calc || '#fb923c')
        .setTitle('Calculator Help')
        .setDescription(
          'Use this command to evaluate simple math expressions.\n\n' +
          '**Usage:**\n' +
          '`$calc <expression>`\n\n' +
          '**Examples:**\n' +
          '• `$calc 5 + 3`\n' +
          '• `$calc 10 - 4`\n' +
          '• `$calc 6 * 7`\n' +
          '• `$calc 20 / 4`\n' +
          '• `$calc 5 * (2 + 3)`\n\n' +
          '**Supported operators:**\n' +
          '`+` addition, `-` subtraction, `*` multiplication, `/` division, `()` parentheses',
        );

      return message.reply({ embeds: [embed] });
    }

    // With args → evaluate expression
    const expr = args.join(' ');

    try {
      const result = evaluate(expr);

      const embed = new EmbedBuilder()
        .setColor(colors.calc || '#fb923c')
        .setTitle('Calculator Result')
        .addFields(
          { name: 'Expression', value: `\`${expr}\``, inline: false },
          { name: 'Result', value: `\`${result}\``, inline: false },
        );

      await message.reply({ embeds: [embed] });
    } catch (err) {
      await message.reply('Invalid expression. Please use a valid math expression.\nTry `$calc` for a usage guide.');
    }
  },
};