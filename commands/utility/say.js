const { PermissionsBitField } = require('discord.js');

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
  return message.reply(
    'Please provide something to say or a command to execute.'
  );
}

const prefix =
  typeof client.getPrefix === 'function'
    ? client.getPrefix(message.guild?.id)
    : '!';

// Check whether the supplied text is a command.
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
    return message.reply('Nice try 💀 I cannot execute vsay inside itself.');
  }

  // Don't delete the original message until we've found the command.
  if (message.deletable) {
    await message.delete().catch(() => {});
  }

  try {
    await command.execute(client, message, parts);
  } catch (error) {
    console.error(`[vsay command error: ${commandName}]`, error);

    await message.channel.send(
      `The command \`${commandName}\` failed to execute.`
    ).catch(() => {});
  }

  return;
}

// Ordinary text: make Vanessa say it.
if (message.deletable) {
  await message.delete().catch(() => {});
}

await message.channel.send({
  content: text,
  allowedMentions: { parse: [] }
});

}
};