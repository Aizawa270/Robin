const { PermissionsBitField } = require('discord.js');
const { executeCommand } = require('../../handlers/commandHandler');

module.exports = {
  name: 'vsay',
  description: 'Makes Vanessa say text or execute a command. Admins only.',
  category: 'utility',
  usage: '$vsay <message>',

  async execute(client, message, args) {
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    const text = args.join(' ').trim();

    if (!text) {
      return message.reply('Give me something to say or a command to execute.');
    }

    const prefix =
      typeof client.getPrefix === 'function'
        ? client.getPrefix(message.guild?.id)
        : '!';

    // If the text starts with the bot's prefix, execute it as a command.
    if (text.startsWith(prefix)) {
      const parts = text.slice(prefix.length).trim().split(/\s+/);
      const commandName = parts.shift()?.toLowerCase();

      if (!commandName) return;

      const command =
        client.commands.get(commandName) ||
        client.aliases.get(commandName);

      if (!command) {
        return message.reply(`I couldn't find the command \`${commandName}\`.`);
      }

      if (command.name === 'vsay') {
        return message.reply('No infinite vsay loop, bro 💀');
      }

      // Execute through your existing handler so message helpers are prepared.
      await executeCommand(client, message, command, parts);

      // Delete the original command message after execution.
      if (message.deletable) {
        await message.delete().catch(() => {});
      }

      return;
    }

    // Otherwise, simply make Vanessa say the supplied text.
    if (message.deletable) {
      await message.delete().catch(() => {});
    }

    await message.channel.send({
      content: text,
      allowedMentions: { parse: [] }
    });
  }
};