const { PermissionsBitField } = require('discord.js');

module.exports = {
name: 'vsay',
description: 'Makes Vanessa repeat a message or execute a command. Admins only.',
category: 'utility',
usage: '$vsay <message>',

async execute(client, message, args) {
// Only administrators can use vsay.
if (
!message.member?.permissions.has(
PermissionsBitField.Flags.Administrator
)
) {
return message.reply(
'Only administrators can use this command.'
);
}

const text = args.join(' ').trim();

if (!text) {
  return message.reply(
    'Please provide a message. Example: `$vsay hello world`'
  );
}

const prefix = client.getPrefix(message.guild?.id) || '$';

// Check whether the supplied text starts with the server prefix.
if (text.startsWith(prefix)) {
  const commandText = text.slice(prefix.length).trim();

  if (!commandText) {
    return message.reply('Please provide a command to execute.');
  }

  const commandArgs = commandText.split(/\s+/);
  const commandName = commandArgs.shift()?.toLowerCase();

  const command =
    client.commands.get(commandName) ||
    client.aliases.get(commandName);

  if (!command) {
    return message.reply(
      `I couldn't find a command named \`${commandName}\`.`
    );
  }

  // Prevent recursive execution of vsay through itself or an alias.
  if (command.name.toLowerCase() === 'vsay') {
    return message.reply(
      'You cannot execute vsay through itself.'
    );
  }

  // Keep the original invoking message as the command context.
  // Existing command handlers can still inspect its author,
  // member, channel, guild, and permissions.
  if (message.deletable) {
    await message.delete().catch(() => {});
  }

  // Reuse the existing command preparation and execution system.
  const { prepareMessage } = require('../../handlers/commandHandler');

  prepareMessage(client, message, command);

  try {
    await command.execute(client, message, commandArgs);
  } catch (error) {
    console.error(
      `[VSay Command Error] ${command.name}`,
      error
    );

    await message.channel.send(
      'Something went wrong while executing that command.'
    ).catch(() => {});
  }

  return;
}

// Normal vsay behavior: repeat the supplied text.
if (message.deletable) {
  await message.delete().catch(() => {});
}

await message.channel.send({
  content: text,
  allowedMentions: {
    parse: [],
  },
});

},
};