const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { prefix } = require('../config');

function loadCommands(client) {
  client.commands = new Collection();

  const commandsPath = path.join(__dirname, '..', 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.warn('No commands folder found.');
    return;
  }

  const categories = fs.readdirSync(commandsPath);

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const stat = fs.statSync(categoryPath);

    // direct .js files in /commands
    if (stat.isFile() && category.endsWith('.js')) {
      const filePath = categoryPath;
      const command = require(filePath);
      if (!command.name || typeof command.execute !== 'function') {
        console.warn(`Skipping invalid command file: ${filePath}`);
        continue;
      }
      client.commands.set(command.name.toLowerCase(), command);
      console.log(`Loaded command: ${command.name} (root)`);
      continue;
    }

    if (!stat.isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter((file) => file.endsWith('.js'));

    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      const command = require(filePath);

      if (!command.name || typeof command.execute !== 'function') {
        console.warn(`Skipping invalid command file: ${filePath}`);
        continue;
      }

      client.commands.set(command.name.toLowerCase(), command);
      console.log(`Loaded command: ${command.name} (${category})`);
    }
  }

  console.log(`Loaded ${client.commands.size} commands.`);
}

async function handleMessage(client, message) {
  if (message.author.bot) return;

  // --- AFK: clear AFK when user sends any message ---
  const afkData = client.afk?.get(message.author.id);
  if (afkData) {
    client.afk.delete(message.author.id);
    try {
      await message.reply(`Welcome back, <@${message.author.id}>. I removed your AFK status.`);
    } catch {
      // ignore reply errors
    }
  }

  // --- AFK: notify when mentioning AFK users ---
  if (message.mentions.users.size > 0 && client.afk) {
    const mentionedAfks = [];
    for (const [, user] of message.mentions.users) {
      const data = client.afk.get(user.id);
      if (data) {
        mentionedAfks.push({ user, data });
      }
    }

    for (const { user, data } of mentionedAfks) {
      try {
        await message.reply(
          `<@${user.id}> is currently AFK: **${data.reason}** (since <t:${Math.floor(
            data.since / 1000,
          )}:R>)`,
        );
      } catch {
        // ignore
      }
    }
  }

  // --- Prefix command handling ---
  const content = message.content;
  if (!content.startsWith(prefix)) return;

  const args = content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.execute(client, message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    try {
      await message.reply('Something went wrong while executing that command.');
    } catch {
      // ignore
    }
  }
}

module.exports = { loadCommands, handleMessage };